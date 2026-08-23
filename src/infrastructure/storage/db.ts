import Dexie, { type Table } from 'dexie'

import type { Country } from '@/domain/models/country'
import type { EstablishmentRecord } from '@/domain/models/record'

/**
 * Persistencia local en IndexedDB (spec seccion 12 y 23 > Persistencia).
 *
 * Unico archivo que conoce Dexie. La aplicacion usa `RecordRepository`.
 */

/** Ajustes de la sesion de trabajo. Se guarda una sola fila, con id fijo. */
export interface SessionSettings {
  readonly id: 'current'
  readonly country: Country | null
  readonly requireCountry: boolean
  readonly updatedAt: string
}

export interface GeolocatorDb extends Dexie {
  records: Table<EstablishmentRecord, string>
  settings: Table<SessionSettings, string>
}

export const DB_NAME = 'geolocator'

/** Implementaciones de IndexedDB inyectables, para poder probar sin navegador. */
export interface IndexedDbDeps {
  readonly indexedDB: IDBFactory
  readonly IDBKeyRange: typeof IDBKeyRange
}

export function createDb(name: string = DB_NAME, deps?: IndexedDbDeps): GeolocatorDb {
  const db = (deps ? new Dexie(name, { ...deps }) : new Dexie(name)) as GeolocatorDb

  db.version(1).stores({
    // Solo se indexa lo que se filtra en la UI; el resto del registro va suelto.
    records: 'id, status, source, createdAt',
    settings: 'id',
  })

  return db
}
