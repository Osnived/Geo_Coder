import type { Country } from '@/domain/models/country'
import type { NormalizedField, NormalizedFields } from '@/domain/models/fields'
import type { EstablishmentRecord, RecordSource } from '@/domain/models/record'
import type { RecordStatus } from '@/domain/models/status'
import type { LoadedWorkbook, SheetPreview, SheetSummary } from '@/infrastructure/excel'

export interface SettingsSlice {
  /** Pais global aplicado a los registros que no traen uno propio. */
  country: Country | null
  /** Si el pais es obligatorio para dar por valido un registro. */
  requireCountry: boolean
  setCountry: (country: Country | null) => void
  setRequireCountry: (value: boolean) => void
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
}

export interface RecordsSlice {
  records: readonly EstablishmentRecord[]
  isHydrated: boolean
  filters: RecordFilters

  hydrate: () => Promise<void>
  setFilters: (filters: Partial<RecordFilters>) => void
  addManualRecord: (fields: Partial<NormalizedFields>) => Promise<string>
  updateRecord: (id: string, changes: Partial<NormalizedFields>) => Promise<void>
  duplicateRecord: (id: string) => Promise<void>
  deleteRecords: (ids: readonly string[]) => Promise<void>
  clearRecords: () => Promise<void>
}

export interface GeocodingProgress {
  readonly isRunning: boolean
  readonly processed: number
  readonly total: number
  readonly currentRecordId: string | null
  /** Ultimo error de proveedor, para avisar sin detener el proceso. */
  readonly lastError: string | null
}

export interface GeocodingSlice {
  geocoding: GeocodingProgress
  /** Geocodifica los registros indicados, o todos los pendientes si se omite. */
  runGeocoding: (ids?: readonly string[]) => Promise<void>
  cancelGeocoding: () => void
}

export type AppState = SettingsSlice & ImportSlice & RecordsSlice & GeocodingSlice
