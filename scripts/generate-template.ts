import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import ExcelJS from 'exceljs'

import {
  buildTemplateWorkbook,
  INSTRUCTIONS_SHEET_NAME,
} from '../src/domain/services/templateBuilder'

/**
 * Escribe la plantilla de carga en disco.
 *
 * La aplicacion la genera en el navegador a partir de este mismo codigo; este
 * script existe para tener ademas una copia versionada en `public/samples/`,
 * descargable sin abrir la aplicacion.
 *
 *   npm run template
 *
 * No duplica los datos: importa el mismo constructor que usa la interfaz, asi
 * que el archivo del repositorio no puede desviarse de lo que la aplicacion
 * entiende.
 */

const OUTPUT = resolve(import.meta.dirname, '../public/samples/plantilla-geolocator.xlsx')

/** Ancho de columna estimado, con topes razonables. */
function columnWidth(header: string, rows: readonly (readonly unknown[])[], index: number): number {
  let widest = header.length
  for (const row of rows) {
    const value = row[index]
    const length = value === null || value === undefined ? 0 : String(value).length
    if (length > widest) widest = length
  }
  return Math.min(Math.max(widest + 2, 12), 70)
}

async function main(): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Geolocator'
  workbook.created = new Date()

  for (const { name, sheet } of buildTemplateWorkbook()) {
    const worksheet = workbook.addWorksheet(name)

    worksheet.addRow([...sheet.headers])
    for (const row of sheet.rows) worksheet.addRow([...row])

    worksheet.getRow(1).font = { bold: true }
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]

    // La hoja de instrucciones es texto corrido: el autofiltro estorba.
    if (name !== INSTRUCTIONS_SHEET_NAME) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.headers.length },
      }
    }

    sheet.headers.forEach((header, index) => {
      worksheet.getColumn(index + 1).width = columnWidth(header, sheet.rows, index)
    })
  }

  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, Buffer.from(await workbook.xlsx.writeBuffer()))
  console.log(`Plantilla escrita en ${OUTPUT}`)
}

await main()
