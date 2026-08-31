import { describe, expect, it } from 'vitest'

import {
  batchTypeLabel,
  createExcelBatch,
  createManualBatch,
  describeBatch,
  formatTimestamp,
  LEGACY_BATCH_ID,
  manualBatchLabel,
  summarizeBatches,
  type ImportBatch,
} from './batch'

describe('createExcelBatch', () => {
  it('toma el nombre del archivo como nombre del grupo', () => {
    const batch = createExcelBatch({
      id: 'g-1',
      fileName: 'clientes_barranquilla.xlsx',
      sheetName: 'Hoja1',
      importedCount: 500,
      createdAt: '2026-08-31T13:00:00.000Z',
    })

    expect(batch.label).toBe('clientes_barranquilla.xlsx')
    expect(batch.source).toBe('excel')
    expect(batch.importedCount).toBe(500)
  })

  it('dos archivos distintos son dos grupos distintos', () => {
    const first = createExcelBatch({
      id: 'g-1',
      fileName: 'clientes_barranquilla.xlsx',
      sheetName: 'Hoja1',
      importedCount: 500,
      createdAt: '2026-08-31T13:00:00.000Z',
    })
    const second = createExcelBatch({
      id: 'g-2',
      fileName: 'clientes_cartagena.xlsx',
      sheetName: 'Hoja1',
      importedCount: 320,
      createdAt: '2026-08-31T14:00:00.000Z',
    })

    expect(first.id).not.toBe(second.id)
    expect(first.label).not.toBe(second.label)
  })
})

describe('createManualBatch', () => {
  it('nombra el grupo con la fecha y la hora', () => {
    const batch = createManualBatch({ id: 'g-1', createdAt: '2026-08-31T13:45:00.000Z' })

    expect(batch.label).toMatch(/^Manual — /)
    expect(batch.label).toContain('31/08/2026')
    expect(batch.source).toBe('manual')
  })

  /**
   * Antes el identificador era la fecha, asi que dos tandas del mismo dia
   * acababan mezcladas en el mismo grupo.
   */
  it('dos sesiones son dos grupos distintos aunque coincida el instante', () => {
    const first = createManualBatch({ id: 'g-1', createdAt: '2026-08-31T13:45:00.000Z' })
    const second = createManualBatch({ id: 'g-2', createdAt: '2026-08-31T13:45:00.000Z' })

    expect(first.id).not.toBe(second.id)
    // Y comparten nombre visible, que es lo correcto: es la misma hora.
    expect(first.label).toBe(second.label)
  })

  it('no usa el nombre visible como identificador', () => {
    const batch = createManualBatch({ id: 'g-1', createdAt: '2026-08-31T13:45:00.000Z' })
    expect(batch.id).not.toBe(batch.label)
  })
})

describe('manualBatchLabel', () => {
  it('cae en "Manual" si la fecha no es utilizable', () => {
    expect(manualBatchLabel('')).toBe('Manual')
    expect(manualBatchLabel('no es una fecha')).toBe('Manual')
  })
})

describe('describeBatch', () => {
  const base: ImportBatch = {
    id: 'g-1',
    label: 'tiendas.xlsx',
    source: 'excel',
    sheetName: 'Hoja1',
    importedCount: 3,
    createdAt: '2026-08-31T13:00:00.000Z',
  }

  it('anade la hoja cuando viene de un archivo', () => {
    expect(describeBatch(base)).toBe('tiendas.xlsx · Hoja1')
  })

  it('sin hoja deja el nombre a secas', () => {
    expect(describeBatch({ ...base, sheetName: null, label: 'Manual — 31/08/2026 08:45' })).toBe(
      'Manual — 31/08/2026 08:45',
    )
  })
})

describe('batchTypeLabel', () => {
  it('distingue Excel de Manual', () => {
    const batch = createManualBatch({ id: 'g-1', createdAt: '2026-08-31T13:45:00.000Z' })
    expect(batchTypeLabel(batch)).toBe('Manual')
    expect(batchTypeLabel({ ...batch, source: 'excel' })).toBe('Excel')
  })
})

describe('formatTimestamp', () => {
  it('devuelve cadena vacia sin fecha', () => {
    expect(formatTimestamp('')).toBe('')
  })

  it('devuelve cadena vacia con una fecha invalida', () => {
    expect(formatTimestamp('mañana')).toBe('')
  })
})

describe('summarizeBatches', () => {
  const excel = createExcelBatch({
    id: 'g-1',
    fileName: 'clientes_barranquilla.xlsx',
    sheetName: 'Hoja1',
    importedCount: 3,
    createdAt: '2026-08-31T13:00:00.000Z',
  })
  const manual = createManualBatch({ id: 'g-2', createdAt: '2026-08-31T19:20:00.000Z' })

  it('cuenta los registros que hay ahora en cada grupo', () => {
    const summary = summarizeBatches(
      [excel, manual],
      [{ batchId: 'g-1' }, { batchId: 'g-1' }, { batchId: manual.id }],
    )

    expect(summary.map((entry) => entry.recordCount)).toEqual([2, 1])
  })

  it('el recuento importado no cambia al borrar registros', () => {
    const summary = summarizeBatches([excel], [{ batchId: 'g-1' }])
    const entry = summary[0]

    expect(entry?.recordCount).toBe(1)
    expect(entry?.batch.importedCount).toBe(3)
  })

  it('mantiene visible un grupo que se quedo sin registros', () => {
    const summary = summarizeBatches([excel], [])
    expect(summary).toHaveLength(1)
    expect(summary[0]?.recordCount).toBe(0)
  })

  it('agrupa bajo el grupo heredado los registros sin grupo guardado', () => {
    const summary = summarizeBatches([excel], [{ batchId: LEGACY_BATCH_ID }])

    expect(summary).toHaveLength(2)
    const legacy = summary.find((entry) => entry.batch.id === LEGACY_BATCH_ID)
    expect(legacy?.batch.label).toBe('Registros anteriores')
    expect(legacy?.recordCount).toBe(1)
  })

  it('no inventa grupos cuando no hay nada', () => {
    expect(summarizeBatches([], [])).toEqual([])
  })

  it('los registros de un grupo no se cuelan en otro', () => {
    const summary = summarizeBatches(
      [excel, manual],
      [{ batchId: 'g-1' }, { batchId: manual.id }, { batchId: manual.id }],
    )

    const byId = new Map(summary.map((entry) => [entry.batch.id, entry.recordCount]))
    expect(byId.get('g-1')).toBe(1)
    expect(byId.get(manual.id)).toBe(2)
  })
})
