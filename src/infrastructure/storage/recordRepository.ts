import type { Country } from '@/domain/models/country'
import type { EstablishmentRecord } from '@/domain/models/record'

import { createDb, type GeolocatorDb, type SessionSettings } from './db'

/**
 * Puerto de persistencia. La aplicacion depende de esta interfaz, no de Dexie,
 * para poder cambiar de almacenamiento (o moverlo a un backend) sin tocar la UI.
 */
export interface RecordRepository {
  loadAll(): Promise<EstablishmentRecord[]>
  addMany(records: readonly EstablishmentRecord[]): Promise<void>
  save(record: EstablishmentRecord): Promise<void>
  remove(ids: readonly string[]): Promise<void>
  clear(): Promise<void>
  loadSettings(): Promise<SessionSettings | null>
  saveSettings(settings: {
    country: Country | null
    requireCountry: boolean
    updatedAt: string
  }): Promise<void>
}

export function createRecordRepository(db: GeolocatorDb = createDb()): RecordRepository {
  return {
    async loadAll() {
      return db.records.orderBy('createdAt').toArray()
    },

    async addMany(records) {
      if (records.length === 0) return
      await db.records.bulkPut([...records])
    },

    async save(record) {
      await db.records.put(record)
    },

    async remove(ids) {
      if (ids.length === 0) return
      await db.records.bulkDelete([...ids])
    },

    async clear() {
      await db.records.clear()
    },

    async loadSettings() {
      return (await db.settings.get('current')) ?? null
    },

    async saveSettings(settings) {
      await db.settings.put({ id: 'current', ...settings })
    },
  }
}

/**
 * Repositorio en memoria. Se usa cuando IndexedDB no esta disponible (modo
 * privado de algunos navegadores) para que la aplicacion siga funcionando,
 * aunque sin persistir entre recargas (spec principio 8).
 */
export function createInMemoryRepository(): RecordRepository {
  const records = new Map<string, EstablishmentRecord>()
  let settings: SessionSettings | null = null

  return {
    loadAll: () =>
      Promise.resolve([...records.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
    addMany: (incoming) => {
      for (const record of incoming) records.set(record.id, record)
      return Promise.resolve()
    },
    save: (record) => {
      records.set(record.id, record)
      return Promise.resolve()
    },
    remove: (ids) => {
      for (const id of ids) records.delete(id)
      return Promise.resolve()
    },
    clear: () => {
      records.clear()
      return Promise.resolve()
    },
    loadSettings: () => Promise.resolve(settings),
    saveSettings: (next) => {
      settings = { id: 'current', ...next }
      return Promise.resolve()
    },
  }
}

/** True si el navegador expone IndexedDB utilizable. */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}
