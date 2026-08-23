import { create } from 'zustand'

import type { NormalizedField } from '@/domain/models/fields'
import type { EstablishmentRecord } from '@/domain/models/record'
import type { RecordStatus } from '@/domain/models/status'
import { suggestColumnMapping } from '@/domain/rules/columnMatching'
import {
  duplicateRecord as duplicateRecordFields,
  normalizeManualEntry,
  normalizeSheet,
  updateRecordFields,
} from '@/domain/services/recordNormalizer'
import { isExcelReadError, readWorkbookFile, type SheetPreview } from '@/infrastructure/excel'
import { newId, nowIso } from '@/shared/id'

import { geocodeRecord, type CandidateScorer } from '@/domain/services/geocoderService'
import { createScorer } from '@/domain/services/scoringService'
import { CONFIDENCE_THRESHOLDS, SCORING_WEIGHTS } from '@/shared/config/geocoding'

import { getProviders } from './geocoder'
import { getRepository } from './repository'
import type { AppState } from './types'

/**
 * Estado de la aplicacion.
 *
 * Aqui solo hay orquestacion: leer archivos, invocar al dominio y persistir.
 * Ninguna regla de negocio vive en este archivo (spec seccion 19).
 */

const PREVIEW_SAMPLE_SIZE = 25

/** Controla la cancelacion del lote en curso. */
let abortController: AbortController | null = null

/** Puntuador activo. Se puede sustituir en los tests. */
let scorer: CandidateScorer = createScorer({ weights: SCORING_WEIGHTS })

export function getScorer(): CandidateScorer {
  return scorer
}

export function setScorer(next: CandidateScorer): void {
  scorer = next
}

/**
 * Estados que se procesan en una ejecucion normal.
 *
 * `NOT_FOUND` queda fuera a proposito: repetirlo sin cambiar los datos gasta
 * peticiones para obtener el mismo vacio. Se reintenta con la accion explicita
 * de la pantalla de busqueda.
 */
const AUTO_TARGET_STATUSES: readonly RecordStatus[] = ['PENDING', 'ERROR']

/** Registros a procesar: los indicados, o los pendientes y los que fallaron. */
function selectTargets(
  records: readonly EstablishmentRecord[],
  ids: readonly string[] | undefined,
): EstablishmentRecord[] {
  if (ids) {
    const wanted = new Set(ids)
    return records.filter((record) => wanted.has(record.id))
  }
  return records.filter((record) => AUTO_TARGET_STATUSES.includes(record.status))
}

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

  // --------------------------------------------------------------- geocoding
  geocoding: {
    isRunning: false,
    processed: 0,
    total: 0,
    currentRecordId: null,
    lastError: null,
  },

  runGeocoding: async (ids) => {
    if (get().geocoding.isRunning) return

    const targets = selectTargets(get().records, ids)
    if (targets.length === 0) return

    abortController?.abort()
    abortController = new AbortController()
    const { signal } = abortController

    set({
      geocoding: {
        isRunning: true,
        processed: 0,
        total: targets.length,
        currentRecordId: null,
        lastError: null,
      },
    })

    const repository = getRepository()
    let processed = 0

    for (const target of targets) {
      if (signal.aborted) break

      set((state) => ({
        geocoding: { ...state.geocoding, currentRecordId: target.id },
      }))
      // Estado visible mientras dura la peticion.
      const searching = { ...target, status: 'SEARCHING' as const, updatedAt: nowIso() }
      set((state) => ({
        records: state.records.map((record) => (record.id === target.id ? searching : record)),
      }))

      const outcome = await geocodeRecord(target, {
        providers: getProviders(),
        scorer: getScorer(),
        thresholds: CONFIDENCE_THRESHOLDS,
        now: nowIso,
        sessionCountry: get().country,
        signal,
      })

      // El registro pudo editarse mientras se buscaba: se relee antes de escribir.
      const current = get().records.find((record) => record.id === target.id)
      if (!current) continue

      const updated = {
        ...current,
        status: outcome.status,
        result: outcome.result,
        updatedAt: nowIso(),
      }
      await repository.save(updated)

      processed += 1
      const failure = outcome.attempts.find((attempt) => attempt.error !== null)?.error ?? null

      set((state) => ({
        records: state.records.map((record) => (record.id === target.id ? updated : record)),
        geocoding: {
          ...state.geocoding,
          processed,
          lastError: failure ? failure.message : state.geocoding.lastError,
        },
      }))
    }

    set((state) => ({
      geocoding: { ...state.geocoding, isRunning: false, currentRecordId: null },
    }))
  },

  cancelGeocoding: () => {
    abortController?.abort()
    set((state) => ({
      geocoding: { ...state.geocoding, isRunning: false, currentRecordId: null },
    }))
  },
}))

/** Campos ya usados por alguna columna, para deshabilitarlos en los selectores. */
export function usedFields(mapping: readonly (NormalizedField | null)[]): Set<NormalizedField> {
  return new Set(mapping.filter((field): field is NormalizedField => field !== null))
}
