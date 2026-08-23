import type { ImportBatch } from '@/domain/models/batch'
import type { Country } from '@/domain/models/country'
import type { EstablishmentRecord } from '@/domain/models/record'

import { createDb, type GeolocatorDb, type SessionSettings } from './db'
import { migrateRecords } from './migrations'

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
  loadBatches(): Promise<ImportBatch[]>
  saveBatch(batch: ImportBatch): Promise<void>
  removeBatches(ids: readonly string[]): Promise<void>
  loadSettings(): Promise<SessionSettings | null>
  saveSettings(settings: {
    country: Country | null
    requireCountry: boolean
    useFallbackProvider: boolean
    ai: { enabled: boolean; endpoint: string; model: string }
    updatedAt: string
  }): Promise<void>
}

export function createRecordRepository(db: GeolocatorDb = createDb()): RecordRepository {
  return {
    async loadAll() {
      // Se normaliza lo leido: puede venir de una version anterior del modelo.
      return migrateRecords(await db.records.orderBy('createdAt').toArray())
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
      await db.batches.clear()
    },

    async loadBatches() {
      return db.batches.orderBy('createdAt').toArray()
    },

    async saveBatch(batch) {
      await db.batches.put(batch)
    },

    async removeBatches(ids) {
      if (ids.length === 0) return
      await db.batches.bulkDelete([...ids])
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
  const batches = new Map<string, ImportBatch>()
  let settings: SessionSettings | null = null

  return {
    loadAll: () =>
      Promise.resolve(
        migrateRecords(
          [...records.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        ),
      ),
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
    loadBatches: () =>
      Promise.resolve([...batches.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
    saveBatch: (batch) => {
      batches.set(batch.id, batch)
      return Promise.resolve()
    },
    removeBatches: (ids) => {
      for (const id of ids) batches.delete(id)
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
