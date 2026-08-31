import type { ImportBatch } from '@/domain/models/batch'
import type { Country } from '@/domain/models/country'
import type { NormalizedField, NormalizedFields } from '@/domain/models/fields'
import type { EstablishmentRecord, RecordSource } from '@/domain/models/record'
import type { RecordStatus } from '@/domain/models/status'
import type { RetrySettings } from '@/domain/services/retryPolicy'
import type { LoadedWorkbook, SheetPreview, SheetSummary } from '@/infrastructure/excel'

import type { AiSettings } from './assistant'

export interface SettingsSlice {
  /** Pais global aplicado a los registros que no traen uno propio. */
  country: Country | null
  /** Si el pais es obligatorio para dar por valido un registro. */
  requireCountry: boolean
  /** Usar Photon como respaldo cuando Nominatim no resuelve. */
  useFallbackProvider: boolean
  /** Porcentaje minimo de exito y reintentos maximos de la geocodificacion. */
  retry: RetrySettings
  setCountry: (country: Country | null) => void
  setRequireCountry: (value: boolean) => void
  setUseFallbackProvider: (value: boolean) => void
  /** Los valores se acotan a su rango valido antes de guardarse. */
  setRetrySettings: (settings: Partial<RetrySettings>) => void
}

export interface ImportSlice {
  /** Libro cargado en memoria. No se persiste. */
  workbook: LoadedWorkbook | null
  fileName: string | null
  sheets: readonly SheetSummary[]
  selectedSheet: string | null
  preview: SheetPreview | null
  /** Campo asignado a cada columna. `null` = ignorar. Indice = columna. */
  mapping: readonly (NormalizedField | null)[]
  /** Columnas cuya sugerencia fue descartada por chocar con otra. */
  displacedColumns: Readonly<Record<number, number>>
  isLoadingFile: boolean
  importError: string | null

  openFile: (file: File) => Promise<void>
  selectSheet: (sheetName: string) => void
  setHeaderRow: (rowNumber: number) => void
  setColumnField: (columnIndex: number, field: NormalizedField | null) => void
  resetMappingToSuggestion: () => void
  clearImport: () => void
  /** Normaliza la hoja con el mapeo actual y agrega los registros. */
  confirmImport: () => Promise<number>
}

export interface RecordFilters {
  readonly text: string
  readonly source: RecordSource | 'all'
  readonly status: RecordStatus | 'all'
  readonly onlyWithIssues: boolean
  /** Id de grupo, o 'all' para no filtrar. */
  readonly batchId: string
}

export interface RecordsSlice {
  records: readonly EstablishmentRecord[]
  /** Grupos conocidos, del mas antiguo al mas reciente. */
  batches: readonly ImportBatch[]
  /**
   * Grupo manual abierto en esta sesion. Todos los registros que se creen a
   * mano caen en el hasta que se cierre.
   */
  activeManualBatchId: string | null
  isHydrated: boolean
  filters: RecordFilters

  hydrate: () => Promise<void>
  setFilters: (filters: Partial<RecordFilters>) => void
  addManualRecord: (fields: Partial<NormalizedFields>) => Promise<string>
  /** Cierra la sesion manual: el siguiente registro abrira un grupo nuevo. */
  closeManualGroup: () => void
  updateRecord: (id: string, changes: Partial<NormalizedFields>) => Promise<void>
  duplicateRecord: (id: string) => Promise<void>
  deleteRecords: (ids: readonly string[]) => Promise<void>
  /** Borra un grupo entero con todos sus registros. */
  deleteBatch: (batchId: string) => Promise<void>
  clearRecords: () => Promise<void>
}

/** Fase del proceso, para que la interfaz no se limite a un girador. */
export type GeocodingPhase =
  'idle' | 'processing' | 'retrying' | 'completed' | 'partial' | 'cancelled' | 'error'

/** Resultado de una vuelta completa: la inicial es la 0. */
export interface GeocodingRound {
  /** 0 = pasada inicial, 1..n = reintentos. */
  readonly attempt: number
  readonly processed: number
  /** Registros que quedaron resueltos, sobre el conjunto de la vuelta. */
  readonly success: number
  readonly total: number
  /** Porcentaje de exito del conjunto completo tras esta vuelta. */
  readonly percentage: number
}

export interface GeocodingProgress {
  readonly isRunning: boolean
  readonly phase: GeocodingPhase
  readonly processed: number
  readonly total: number
  readonly currentRecordId: string | null
  /** 0 durante la pasada inicial, 1..n durante los reintentos. */
  readonly attempt: number
  readonly maxRetries: number
  /** Historial de vueltas, en orden. Alimenta el relato de la interfaz. */
  readonly rounds: readonly GeocodingRound[]
  /** Porcentaje de exito del conjunto que se esta procesando. */
  readonly percentage: number
  /** Por que se detuvo, cuando ya no hay mas vueltas. */
  readonly stopReason: 'threshold-met' | 'no-retries-left' | 'nothing-to-retry' | null
  /** Ultimo error de proveedor, para avisar sin detener el proceso. */
  readonly lastError: string | null
}

export interface GeocodingSlice {
  geocoding: GeocodingProgress
  /** Geocodifica los registros indicados, o todos los pendientes si se omite. */
  runGeocoding: (ids?: readonly string[]) => Promise<void>
  cancelGeocoding: () => void
}

export interface ReviewSlice {
  /** Da por bueno el resultado actual. */
  acceptResult: (id: string) => Promise<void>
  /** Descarta el resultado actual conservandolo como rechazado. */
  rejectResult: (id: string) => Promise<void>
  /** Sustituye el resultado por uno de los candidatos del proveedor. */
  chooseCandidate: (id: string, candidateIndex: number) => Promise<void>
  /** Fija unas coordenadas marcadas a mano sobre el mapa. */
  pickCoordinates: (id: string, latitude: number, longitude: number) => Promise<void>
}

export interface AiSlice {
  ai: AiSettings
  setAiSettings: (settings: Partial<AiSettings>) => void
  /**
   * Pide al asistente que interprete las columnas que las reglas no
   * reconocieron. Devuelve cuantas resolvio.
   */
  assistColumnMapping: () => Promise<number>
  /** Estado de la ultima peticion al asistente. */
  aiBusy: boolean
}

export type AppState = SettingsSlice &
  ImportSlice &
  RecordsSlice &
  GeocodingSlice &
  ReviewSlice &
  AiSlice
