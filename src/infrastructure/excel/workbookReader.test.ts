import { describe, expect, it } from 'vitest'

import { ExcelReadError } from './errors'
import { readWorkbook } from './workbookReader'

/**
 * Estos tests construyen archivos reales en memoria y los vuelven a leer.
 * Corren en el entorno jsdom, que resuelve el build de navegador de ExcelJS:
 * si ese build se rompiera, aqui se detecta.
 */

interface SheetSpec {
  readonly name: string
  readonly rows: readonly (readonly unknown[])[]
}

async function makeXlsx(sheets: readonly SheetSpec[]): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name)
    for (const row of sheet.rows) {
      worksheet.addRow([...row])
    }
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as ArrayBuffer
}

function makeCsv(text: string, encoding: 'utf-8' | 'windows-1252' = 'utf-8'): ArrayBuffer {
  if (encoding === 'utf-8') {
    return new TextEncoder().encode(text).buffer as ArrayBuffer
  }
  // Windows-1252 coincide con Latin-1 en el rango que nos interesa.
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff
  }
  return bytes.buffer
}

describe('readWorkbook con XLSX', () => {
  it('lista las hojas con su tamano', async () => {
    const buffer = await makeXlsx([
      {
        name: 'Tiendas',
        rows: [
          ['CLIENTE', 'CIUDAD'],
          ['Olimpica', 'Barranquilla'],
        ],
      },
      { name: 'Vacia', rows: [] },
    ])
    const workbook = await readWorkbook({ fileName: 'tiendas.xlsx', buffer })

    expect(workbook.fileName).toBe('tiendas.xlsx')
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(['Tiendas', 'Vacia'])
    expect(workbook.sheets[0]).toMatchObject({ rowCount: 2, columnCount: 2, isEmpty: false })
    expect(workbook.sheets[1]?.isEmpty).toBe(true)
  })

  it('genera una vista previa con encabezados detectados', async () => {
    const buffer = await makeXlsx([
      {
        name: 'Tiendas',
        rows: [
          ['CLIENTE', 'NOMBRE DEL LOCAL', 'CIUDAD'],
          ['Olimpica', 'Olimpica Calle 72', 'Barranquilla'],
          ['Olimpica', 'Olimpica Prado', 'Barranquilla'],
        ],
      },
    ])
    const workbook = await readWorkbook({ fileName: 'tiendas.xlsx', buffer })
    const preview = workbook.preview('Tiendas')

    expect(preview.headerRowNumber).toBe(1)
    expect(preview.headers).toEqual(['CLIENTE', 'NOMBRE DEL LOCAL', 'CIUDAD'])
    expect(preview.totalDataRows).toBe(2)
  })

  it('salta un titulo suelto antes de los encabezados', async () => {
    const buffer = await makeXlsx([
      {
        name: 'Tiendas',
        rows: [
          ['LISTADO DE TIENDAS'],
          [],
          ['CLIENTE', 'NOMBRE DEL LOCAL', 'CIUDAD'],
          ['Olimpica', 'Olimpica Calle 72', 'Barranquilla'],
        ],
      },
    ])
    const workbook = await readWorkbook({ fileName: 'tiendas.xlsx', buffer })
    const preview = workbook.preview('Tiendas')

    expect(preview.headerRowNumber).toBe(3)
    expect(preview.headers).toEqual(['CLIENTE', 'NOMBRE DEL LOCAL', 'CIUDAD'])
    expect(preview.totalDataRows).toBe(1)
  })

  it('preserva acentos y caracteres especiales', async () => {
    const buffer = await makeXlsx([
      {
        name: 'Tiendas',
        rows: [
          ['DIRECCIÓN', 'CIUDAD'],
          ['Cra. 53 #75-140, Local #3 & 4', 'Bogotá'],
        ],
      },
    ])
    const workbook = await readWorkbook({ fileName: 'tiendas.xlsx', buffer })
    const sheet = workbook.readSheet('Tiendas')

    expect(sheet.headers[0]).toBe('DIRECCIÓN')
    expect(sheet.rows[0]?.[0]).toBe('Cra. 53 #75-140, Local #3 & 4')
    expect(sheet.rows[0]?.[1]).toBe('Bogotá')
  })

  it('devuelve numeros sin convertirlos a texto en la matriz cruda', async () => {
    const buffer = await makeXlsx([{ name: 'Tiendas', rows: [['CP'], [80020]] }])
    const workbook = await readWorkbook({ fileName: 'tiendas.xlsx', buffer })

    expect(workbook.readSheet('Tiendas').rows[0]?.[0]).toBe(80020)
  })

  it('falla al pedir una hoja inexistente', async () => {
    const buffer = await makeXlsx([{ name: 'Tiendas', rows: [['A'], ['1']] }])
    const workbook = await readWorkbook({ fileName: 'tiendas.xlsx', buffer })

    expect(() => workbook.readSheet('NoExiste')).toThrow(
      expect.objectContaining({ code: 'SHEET_NOT_FOUND' }),
    )
  })

  it('falla al leer una hoja vacia', async () => {
    const buffer = await makeXlsx([{ name: 'Vacia', rows: [] }])
    const workbook = await readWorkbook({ fileName: 'tiendas.xlsx', buffer })

    expect(() => workbook.preview('Vacia')).toThrow(
      expect.objectContaining({ code: 'EMPTY_SHEET' }),
    )
  })

  it('rechaza un archivo que no es un Excel valido', async () => {
    const buffer = makeCsv('esto no es un xlsx')
    await expect(readWorkbook({ fileName: 'roto.xlsx', buffer })).rejects.toThrow(
      expect.objectContaining({ code: 'CORRUPT_FILE' }),
    )
  })
})

describe('readWorkbook con CSV', () => {
  it('lee un CSV separado por comas', async () => {
    const buffer = makeCsv('CLIENTE,CIUDAD\nOlimpica,Barranquilla\n')
    const workbook = await readWorkbook({ fileName: 'tiendas.csv', buffer })
    const sheet = workbook.readSheet('tiendas.csv')

    expect(sheet.headers).toEqual(['CLIENTE', 'CIUDAD'])
    expect(sheet.rows).toEqual([['Olimpica', 'Barranquilla']])
  })

  it('detecta el punto y coma que usa Excel en espanol', async () => {
    const buffer = makeCsv('CLIENTE;CIUDAD\nOlimpica;Barranquilla\n')
    const workbook = await readWorkbook({ fileName: 'tiendas.csv', buffer })

    expect(workbook.readSheet('tiendas.csv').headers).toEqual(['CLIENTE', 'CIUDAD'])
  })

  it('respeta las comillas alrededor de comas dentro de un campo', async () => {
    const buffer = makeCsv('NOMBRE,DIRECCION\nToks,"Av. Universidad 1000, Local 5"\n')
    const workbook = await readWorkbook({ fileName: 'tiendas.csv', buffer })

    expect(workbook.readSheet('tiendas.csv').rows[0]?.[1]).toBe('Av. Universidad 1000, Local 5')
  })

  it('recupera acentos de un CSV en Windows-1252', async () => {
    const buffer = makeCsv('CIUDAD\nBogotá\n', 'windows-1252')
    const workbook = await readWorkbook({ fileName: 'tiendas.csv', buffer })

    expect(workbook.readSheet('tiendas.csv').rows[0]?.[0]).toBe('Bogotá')
  })
})

describe('readWorkbook con formatos no soportados', () => {
  it('explica que hacer con un .xls antiguo', async () => {
    await expect(
      readWorkbook({ fileName: 'viejo.xls', buffer: makeCsv('x') }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
  })

  it('rechaza extensiones desconocidas', async () => {
    await expect(
      readWorkbook({ fileName: 'datos.pdf', buffer: makeCsv('x') }),
    ).rejects.toBeInstanceOf(ExcelReadError)
  })
})
