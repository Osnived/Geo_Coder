import { create } from 'zustand'

import type { NormalizedField } from '@/domain/models/fields'
import { suggestColumnMapping } from '@/domain/rules/columnMatching'
import {
  duplicateRecord as duplicateRecordFields,
  normalizeManualEntry,
  normalizeSheet,
  updateRecordFields,
} from '@/domain/services/recordNormalizer'
import { isExcelReadError, readWorkbookFile, type SheetPreview } from '@/infrastructure/excel'
import { newId, nowIso } from '@/shared/id'

import { getRepository } from './repository'
import type { AppState } from './types'

/**
 * Estado de la aplicacion.
 *
 * Aqui solo hay orquestacion: leer archivos, invocar al dominio y persistir.
 * Ninguna regla de negocio vive en este archivo (spec seccion 19).
 */

const PREVIEW_SAMPLE_SIZE = 25

function normalizeOptions(state: Pick<AppState, 'country'>) {
  return { newId, now: nowIso, defaultCountry: state.country }
}

function describeError(error: unknown): string {
  if (isExcelReadError(error)) return error.message
  if (error instanceof Error) return error.message
  return 'Error desconocido al leer el archivo.'
}

/** Deriva mapeo sugerido y columnas desplazadas a partir de una vista previa. */
function suggestionsFor(preview: SheetPreview) {
  const entries = suggestColumnMapping(preview.headers)
  const mapping = entries.map((entry) => entry.field)
  const displaced: Record<number, number> = {}
  for (const entry of entries) {
    if (entry.displacedBy !== null) displaced[entry.columnIndex] = entry.displacedBy
  }
  return { mapping, displaced }
}

export const useAppStore = create<AppState>()((set, get) => ({
  // ---------------------------------------------------------------- settings
  country: null,
  requireCountry: true,

  setCountry: (country) => {
    set({ country })
    void getRepository().saveSettings({
      country,
      requireCountry: get().requireCountry,
      updatedAt: nowIso(),
    })
  },

  setRequireCountry: (requireCountry) => {
    set({ requireCountry })
    void getRepository().saveSettings({
      country: get().country,
      requireCountry,
      updatedAt: nowIso(),
    })
  },

  // ------------------------------------------------------------------ import
  workbook: null,
  fileName: null,
  sheets: [],
  selectedSheet: null,
  preview: null,
  mapping: [],
  displacedColumns: {},
  isLoadingFile: false,
  importError: null,

  openFile: async (file) => {
    set({ isLoadingFile: true, importError: null })
    try {
      const workbook = await readWorkbookFile(file)
      set({
        workbook,
        fileName: workbook.fileName,
        sheets: workbook.sheets,
        selectedSheet: null,
        preview: null,
        mapping: [],
        displacedColumns: {},
        isLoadingFile: false,
      })

      // Con una sola hoja util no tiene sentido obligar a elegirla.
      const usable = workbook.sheets.filter((sheet) => !sheet.isEmpty)
      const only = usable[0]
      if (usable.length === 1 && only) get().selectSheet(only.name)
    } catch (error) {
      set({
        isLoadingFile: false,
        importError: describeError(error),
        workbook: null,
        fileName: null,
        sheets: [],
        selectedSheet: null,
        preview: null,
        mapping: [],
        displacedColumns: {},
      })
    }
  },

  selectSheet: (sheetName) => {
    const { workbook } = get()
    if (!workbook) return
    try {
      const preview = workbook.preview(sheetName, { sampleSize: PREVIEW_SAMPLE_SIZE })
      const { mapping, displaced } = suggestionsFor(preview)
      set({
        selectedSheet: sheetName,
        preview,
        mapping,
        displacedColumns: displaced,
        importError: null,
      })
    } catch (error) {
      set({
        selectedSheet: sheetName,
        preview: null,
        mapping: [],
        displacedColumns: {},
        importError: describeError(error),
      })
    }
  },

  setHeaderRow: (rowNumber) => {
    const { workbook, selectedSheet } = get()
    if (!workbook || !selectedSheet) return
    try {
      const preview = workbook.preview(selectedSheet, {
        sampleSize: PREVIEW_SAMPLE_SIZE,
        headerRowNumber: rowNumber,
      })
      const { mapping, displaced } = suggestionsFor(preview)
      set({ preview, mapping, displacedColumns: displaced, importError: null })
    } catch (error) {
      set({ importError: describeError(error) })
    }
  },

  setColumnField: (columnIndex, field) => {
    const mapping = [...get().mapping]
    // Un campo no puede estar en dos columnas: se libera la anterior.
    if (field !== null) {
      for (let index = 0; index < mapping.length; index += 1) {
        if (index !== columnIndex && mapping[index] === field) mapping[index] = null
      }
    }
    mapping[columnIndex] = field
    set({ mapping })
  },

  resetMappingToSuggestion: () => {
    const { preview } = get()
    if (!preview) return
    const { mapping, displaced } = suggestionsFor(preview)
    set({ mapping, displacedColumns: displaced })
  },

  clearImport: () =>
    set({
      workbook: null,
      fileName: null,
      sheets: [],
      selectedSheet: null,
      preview: null,
      mapping: [],
      displacedColumns: {},
      importError: null,
    }),

  confirmImport: async () => {
    const state = get()
    const { workbook, selectedSheet, preview } = state
    if (!workbook || !selectedSheet || !preview) return 0

    try {
      const sheet = workbook.readSheet(selectedSheet, {
        headerRowNumber: preview.headerRowNumber,
      })
      const { records } = normalizeSheet(sheet, state.mapping, normalizeOptions(state))

      await getRepository().addMany(records)
      set({ records: [...state.records, ...records] })
      return records.length
    } catch (error) {
      set({ importError: describeError(error) })
      return 0
    }
  },

  // ----------------------------------------------------------------- records
  records: [],
  isHydrated: false,
  filters: { text: '', source: 'all', status: 'all', onlyWithIssues: false },

  hydrate: async () => {
    const repository = getRepository()
    const [records, settings] = await Promise.all([repository.loadAll(), repository.loadSettings()])
    set({
      records,
      isHydrated: true,
      country: settings?.country ?? null,
      requireCountry: settings?.requireCountry ?? true,
    })
  },

  setFilters: (filters) => set({ filters: { ...get().filters, ...filters } }),

  addManualRecord: async (fields) => {
    const state = get()
    const record = normalizeManualEntry(fields, normalizeOptions(state))
    await getRepository().save(record)
    set({ records: [...state.records, record] })
    return record.id
  },

  updateRecord: async (id, changes) => {
    const state = get()
    const existing = state.records.find((record) => record.id === id)
    if (!existing) return

    const updated = updateRecordFields(existing, changes, { now: nowIso })
    await getRepository().save(updated)
    set({ records: state.records.map((record) => (record.id === id ? updated : record)) })
  },

  duplicateRecord: async (id) => {
    const state = get()
    const existing = state.records.find((record) => record.id === id)
    if (!existing) return

    const copy = duplicateRecordFields(existing, normalizeOptions(state))
    await getRepository().save(copy)
    // La copia se coloca junto al original para que se vea de inmediato.
    const index = state.records.findIndex((record) => record.id === id)
    const records = [...state.records]
    records.splice(index + 1, 0, copy)
    set({ records })
  },

  deleteRecords: async (ids) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    await getRepository().remove(ids)
    set({ records: get().records.filter((record) => !idSet.has(record.id)) })
  },

  clearRecords: async () => {
    await getRepository().clear()
    set({ records: [] })
  },
}))

/** Campos ya usados por alguna columna, para deshabilitarlos en los selectores. */
export function usedFields(mapping: readonly (NormalizedField | null)[]): Set<NormalizedField> {
  return new Set(mapping.filter((field): field is NormalizedField => field !== null))
}
