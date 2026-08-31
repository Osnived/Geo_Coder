import { create } from 'zustand'

import type { NormalizedField } from '@/domain/models/fields'
import { createExcelBatch, createManualBatch } from '@/domain/models/batch'
import type { GeocodeQuery } from '@/domain/models/geocode'
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
import { newId, nowIso, nowMs } from '@/shared/id'

import {
  geocodeRecord,
  type CandidateScorer,
  type GeocodeOptions,
  type GeocodeOutcome,
} from '@/domain/services/geocoderService'
import { resolveCountry } from '@/domain/services/queryBuilder'
import {
  acceptResult as accept,
  rejectResult as reject,
  selectCandidate,
  setManualCoordinates,
} from '@/domain/services/reviewService'
import {
  clampMaxRetries,
  clampSuccessPercentage,
  decideRetry,
  DEFAULT_RETRY_SETTINGS,
  summarizeAttempt,
} from '@/domain/services/retryPolicy'
import { createScorer } from '@/domain/services/scoringService'
import {
  AMBIGUITY_DELTA,
  CONFIDENCE_CAPS,
  CONFIDENCE_THRESHOLDS,
  SCORING_WEIGHTS,
} from '@/shared/config/geocoding'

import { DEFAULT_AI_SETTINGS, getAssistant, type AiSettings } from './assistant'
import { getProviders } from './geocoder'
import { getRepository } from './repository'
import type { AppState, GeocodingRound } from './types'

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

/**
 * Reintento asistido por IA. Solo entra en juego cuando la busqueda
 * determinista se ha quedado sin opciones (spec seccion 22).
 */
async function retryWithAssistant(
  record: EstablishmentRecord,
  previous: GeocodeOutcome,
  options: Omit<GeocodeOptions, 'queries'>,
  ai: AiSettings,
  signal: AbortSignal,
): Promise<GeocodeOutcome> {
  const tried = previous.attempts.map((attempt) => attempt.query.text)
  const suggestions = await getAssistant(ai).suggestQueries(record, tried, signal)
  if (suggestions.length === 0) return previous

  const country = resolveCountry(record, options.sessionCountry ?? null)
  const queries: GeocodeQuery[] = suggestions.map((text, index) => ({
    text,
    country,
    usedFields: [],
    strategy: previous.attempts.length + index,
    templateId: `ia-${String(index)}`,
  }))

  const retried = await geocodeRecord(record, { ...options, queries })
  if (retried.result === null) {
    // Se conservan los intentos de ambas rondas para poder explicarlo.
    return { ...retried, attempts: [...previous.attempts, ...retried.attempts] }
  }
  return {
    ...retried,
    attempts: [...previous.attempts, ...retried.attempts],
    result: {
      ...retried.result,
      notes: [...retried.result.notes, 'Consulta propuesta por el asistente de IA.'],
    },
  }
}

/** Guarda los ajustes de sesion en un solo sitio. */
function persistSettings(state: AppState): void {
  void getRepository().saveSettings({
    country: state.country,
    requireCountry: state.requireCountry,
    useFallbackProvider: state.useFallbackProvider,
    retry: state.retry,
    ai: state.ai,
    updatedAt: nowIso(),
  })
}

/** Aplica una transicion de revision a un registro y la persiste. */
async function applyReview(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  id: string,
  transition: (record: EstablishmentRecord) => EstablishmentRecord,
): Promise<void> {
  const current = get().records.find((record) => record.id === id)
  if (!current) return

  const updated = transition(current)
  if (updated === current) return

  await getRepository().save(updated)
  set({ records: get().records.map((record) => (record.id === id ? updated : record)) })
}

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

function normalizeOptions(state: Pick<AppState, 'country'>, batchId: string) {
  return { batchId, newId, now: nowIso, defaultCountry: state.country }
}

/**
 * Devuelve el grupo manual de la sesion en curso, creandolo si hace falta.
 *
 * Un grupo por sesion de entrada y no por registro ni por dia: quien mete
 * veinte tiendas seguidas esta creando un conjunto, no veinte. El grupo se
 * cierra explicitamente con `closeManualGroup`, o al recargar la pagina.
 */
async function ensureManualBatch(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
): Promise<string> {
  const active = get().activeManualBatchId
  if (active !== null && get().batches.some((batch) => batch.id === active)) return active

  const batch = createManualBatch({ id: newId(), createdAt: nowIso() })
  await getRepository().saveBatch(batch)
  set({ batches: [...get().batches, batch], activeManualBatchId: batch.id })
  return batch.id
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

/**
 * Una pasada completa sobre una lista de registros.
 *
 * Devuelve cuantos se procesaron. No decide nada sobre reintentos: eso lo hace
 * `runGeocoding` cuando la pasada ha terminado, con el porcentaje ya a la vista.
 */
async function geocodePass(
  targets: readonly EstablishmentRecord[],
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  signal: AbortSignal,
): Promise<number> {
  const repository = getRepository()
  let processed = 0

  for (const target of targets) {
    if (signal.aborted) break

    set((state) => ({
      geocoding: {
        ...state.geocoding,
        currentRecordId: target.id,
        currentRecordStartedAt: nowMs(),
      },
    }))
    // Estado visible mientras dura la peticion.
    const searching = { ...target, status: 'SEARCHING' as const, updatedAt: nowIso() }
    set((state) => ({
      records: state.records.map((record) => (record.id === target.id ? searching : record)),
    }))

    const baseOptions = {
      providers: getProviders(get().useFallbackProvider),
      scorer: getScorer(),
      thresholds: CONFIDENCE_THRESHOLDS,
      caps: CONFIDENCE_CAPS,
      ambiguityDelta: AMBIGUITY_DELTA,
      now: nowIso,
      sessionCountry: get().country,
      signal,
    }

    let outcome = await geocodeRecord(target, baseOptions)

    // Ultimo recurso: si las estrategias deterministas no dieron nada y el
    // asistente esta activo, se prueban las alternativas que proponga.
    if (outcome.status === 'NOT_FOUND' && get().ai.enabled) {
      outcome = await retryWithAssistant(target, outcome, baseOptions, get().ai, signal)
    }

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

  return processed
}

export const useAppStore = create<AppState>()((set, get) => ({
  // ---------------------------------------------------------------- settings
  country: null,
  requireCountry: true,
  useFallbackProvider: false,
  retry: DEFAULT_RETRY_SETTINGS,

  setCountry: (country) => {
    set({ country })
    persistSettings(get())
  },

  setRequireCountry: (requireCountry) => {
    set({ requireCountry })
    persistSettings(get())
  },

  setUseFallbackProvider: (useFallbackProvider) => {
    set({ useFallbackProvider })
    persistSettings(get())
  },

  setRetrySettings: (settings) => {
    const current = get().retry
    set({
      retry: {
        minimumSuccessPercentage: clampSuccessPercentage(
          settings.minimumSuccessPercentage ?? current.minimumSuccessPercentage,
        ),
        maxRetries: clampMaxRetries(settings.maxRetries ?? current.maxRetries),
      },
    })
    persistSettings(get())
  },

  // ---------------------------------------------------------------------- ia
  ai: DEFAULT_AI_SETTINGS,
  aiBusy: false,

  setAiSettings: (settings) => {
    set({ ai: { ...get().ai, ...settings } })
    persistSettings(get())
  },

  assistColumnMapping: async () => {
    const { preview, mapping, ai } = get()
    if (!preview || !ai.enabled) return 0

    // Solo se pregunta por lo que las reglas no supieron resolver.
    const unknown = preview.headers
      .map((header, index) => ({ header, index }))
      .filter((entry) => mapping[entry.index] == null && entry.header.trim() !== '')

    if (unknown.length === 0) return 0

    set({ aiBusy: true })
    try {
      const suggestions = await getAssistant(ai).mapUnknownColumns(
        unknown.map((entry) => entry.header),
      )

      let applied = 0
      for (const suggestion of suggestions) {
        const target = unknown.find((entry) => entry.header === suggestion.header)
        if (!target) continue
        // Nunca pisa un campo que el usuario ya asigno.
        if (get().mapping.includes(suggestion.field)) continue
        get().setColumnField(target.index, suggestion.field)
        applied += 1
      }
      return applied
    } finally {
      set({ aiBusy: false })
    }
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
  importDefaults: {},

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
        importDefaults: {},
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
        importDefaults: {},
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

  setImportDefault: (field, value) => {
    set({ importDefaults: { ...get().importDefaults, [field]: value } })
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
      // Los valores por defecto son de la carga que se acaba de cerrar.
      importDefaults: {},
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

      // Cada importacion es un lote propio, aunque se repita el mismo archivo.
      const batchId = newId()
      const { records } = normalizeSheet(sheet, state.mapping, {
        ...normalizeOptions(state, batchId),
        defaults: state.importDefaults,
      })
      if (records.length === 0) return 0

      const batch = createExcelBatch({
        id: batchId,
        fileName: workbook.fileName,
        sheetName: selectedSheet,
        importedCount: records.length,
        createdAt: nowIso(),
      })

      const repository = getRepository()
      await repository.saveBatch(batch)
      await repository.addMany(records)

      set({
        records: [...state.records, ...records],
        batches: [...state.batches, batch],
      })
      return records.length
    } catch (error) {
      set({ importError: describeError(error) })
      return 0
    }
  },

  // ----------------------------------------------------------------- records
  records: [],
  batches: [],
  activeManualBatchId: null,
  isHydrated: false,
  filters: { text: '', source: 'all', status: 'all', onlyWithIssues: false, batchId: 'all' },

  hydrate: async () => {
    const repository = getRepository()
    const [records, batches, settings] = await Promise.all([
      repository.loadAll(),
      repository.loadBatches(),
      repository.loadSettings(),
    ])
    set({
      records,
      batches,
      isHydrated: true,
      country: settings?.country ?? null,
      requireCountry: settings?.requireCountry ?? true,
      useFallbackProvider: settings?.useFallbackProvider ?? false,
      retry: settings?.retry
        ? {
            minimumSuccessPercentage: clampSuccessPercentage(
              settings.retry.minimumSuccessPercentage,
            ),
            maxRetries: clampMaxRetries(settings.retry.maxRetries),
          }
        : DEFAULT_RETRY_SETTINGS,
      ai: settings?.ai ?? DEFAULT_AI_SETTINGS,
    })
  },

  setFilters: (filters) => set({ filters: { ...get().filters, ...filters } }),

  addManualRecord: async (fields) => {
    const batchId = await ensureManualBatch(get, set)
    const state = get()
    const record = normalizeManualEntry(fields, normalizeOptions(state, batchId))
    await getRepository().save(record)
    set({ records: [...state.records, record] })
    return record.id
  },

  closeManualGroup: () => {
    set({ activeManualBatchId: null })
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

    // La copia se queda en el mismo lote que el original.
    const copy = duplicateRecordFields(existing, normalizeOptions(state, existing.batchId))
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

  deleteBatch: async (batchId) => {
    const ids = get()
      .records.filter((record) => record.batchId === batchId)
      .map((record) => record.id)

    const repository = getRepository()
    await repository.remove(ids)
    await repository.removeBatches([batchId])

    set({
      records: get().records.filter((record) => record.batchId !== batchId),
      batches: get().batches.filter((batch) => batch.id !== batchId),
      // Si se borro el grupo manual abierto, el siguiente registro abre otro.
      ...(get().activeManualBatchId === batchId ? { activeManualBatchId: null } : {}),
    })
  },

  clearRecords: async () => {
    await getRepository().clear()
    set({ records: [], batches: [], activeManualBatchId: null })
  },

  // --------------------------------------------------------------- geocoding
  geocoding: {
    isRunning: false,
    phase: 'idle',
    processed: 0,
    total: 0,
    currentRecordId: null,
    attempt: 0,
    maxRetries: DEFAULT_RETRY_SETTINGS.maxRetries,
    rounds: [],
    percentage: 0,
    stopReason: null,
    lastError: null,
    startedAt: null,
    roundStartedAt: null,
    currentRecordStartedAt: null,
    finishedAt: null,
  },

  runGeocoding: async (ids) => {
    if (get().geocoding.isRunning) return

    const firstPass = selectTargets(get().records, ids)
    if (firstPass.length === 0) return

    abortController?.abort()
    abortController = new AbortController()
    const { signal } = abortController

    const settings = get().retry
    /**
     * El porcentaje se mide siempre sobre este conjunto, el de la pasada
     * inicial, no sobre los que quedan por reintentar. Medirlo sobre los
     * reintentos daria porcentajes que suben y bajan sin significar nada.
     */
    const scopeIds = firstPass.map((record) => record.id)

    const currentScope = (): EstablishmentRecord[] => {
      const byId = new Map(get().records.map((record) => [record.id, record]))
      return scopeIds.flatMap((id) => {
        const record = byId.get(id)
        return record ? [record] : []
      })
    }

    const startedAt = nowMs()

    set({
      geocoding: {
        isRunning: true,
        phase: 'processing',
        processed: 0,
        total: firstPass.length,
        currentRecordId: null,
        attempt: 0,
        maxRetries: settings.maxRetries,
        rounds: [],
        percentage: 0,
        stopReason: null,
        lastError: null,
        startedAt,
        roundStartedAt: startedAt,
        currentRecordStartedAt: null,
        finishedAt: null,
      },
    })

    const rounds: GeocodingRound[] = []
    let roundStartedAt = startedAt
    let targets = firstPass
    let attempt = 0
    let stopReason: 'threshold-met' | 'no-retries-left' | 'nothing-to-retry' | null = null

    // Cada vuelta procesa su lista completa antes de decidir si hay otra.
    for (;;) {
      const processedInRound = await geocodePass(targets, get, set, signal)
      if (signal.aborted) break

      const scope = currentScope()
      const summary = summarizeAttempt(scope)
      rounds.push({
        attempt,
        processed: processedInRound,
        success: summary.success,
        total: summary.total,
        percentage: summary.percentage,
        durationMs: nowMs() - roundStartedAt,
      })

      const decision = decideRetry({
        records: scope,
        percentage: summary.percentage,
        settings,
        retriesUsed: attempt,
      })

      set((state) => ({
        geocoding: {
          ...state.geocoding,
          rounds: [...rounds],
          percentage: summary.percentage,
        },
      }))

      if (!decision.retry) {
        stopReason = decision.reason
        break
      }

      attempt += 1
      const wanted = new Set(decision.targetIds)
      targets = scope.filter((record) => wanted.has(record.id))
      roundStartedAt = nowMs()

      set((state) => ({
        geocoding: {
          ...state.geocoding,
          phase: 'retrying',
          attempt,
          processed: 0,
          total: targets.length,
          currentRecordId: null,
          currentRecordStartedAt: null,
          roundStartedAt,
        },
      }))
    }

    const finalSummary = summarizeAttempt(currentScope())

    set((state) => ({
      geocoding: {
        ...state.geocoding,
        isRunning: false,
        currentRecordId: null,
        currentRecordStartedAt: null,
        rounds: [...rounds],
        percentage: finalSummary.percentage,
        stopReason,
        finishedAt: nowMs(),
        phase: signal.aborted
          ? 'cancelled'
          : finalSummary.percentage >= settings.minimumSuccessPercentage
            ? 'completed'
            : 'partial',
      },
    }))
  },

  // ------------------------------------------------------------------ review
  acceptResult: (id) => applyReview(get, set, id, (record) => accept(record, { now: nowIso })),

  rejectResult: (id) => applyReview(get, set, id, (record) => reject(record, { now: nowIso })),

  chooseCandidate: (id, candidateIndex) =>
    applyReview(get, set, id, (record) => {
      const candidate = record.result?.candidates[candidateIndex]
      if (!candidate) return record
      return selectCandidate(record, candidate, { now: nowIso })
    }),

  pickCoordinates: (id, latitude, longitude) =>
    applyReview(get, set, id, (record) =>
      setManualCoordinates(record, latitude, longitude, { now: nowIso }),
    ),

  cancelGeocoding: () => {
    abortController?.abort()
    set((state) => ({
      geocoding: {
        ...state.geocoding,
        isRunning: false,
        phase: 'cancelled',
        currentRecordId: null,
        currentRecordStartedAt: null,
        finishedAt: nowMs(),
      },
    }))
  },
}))

/** Campos ya usados por alguna columna, para deshabilitarlos en los selectores. */
export function usedFields(mapping: readonly (NormalizedField | null)[]): Set<NormalizedField> {
  return new Set(mapping.filter((field): field is NormalizedField => field !== null))
}
