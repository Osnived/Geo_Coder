import type { GeocodeResult } from '@/domain/models/geocode'
import type { EstablishmentRecord } from '@/domain/models/record'
import { emptyFields } from '@/domain/models/fields'
import { LEGACY_BATCH_ID } from '@/domain/models/batch'

/**
 * Normalizacion de lo que sale de IndexedDB.
 *
 * Los registros guardados por una version anterior de la aplicacion no tienen
 * los campos que se anadieron despues. Rellenarlos aqui, en el borde de la
 * persistencia, permite que el resto del codigo confie en los tipos en lugar
 * de comprobar `undefined` en cada pantalla.
 *
 * Nunca inventa datos: solo pone los valores vacios que corresponden.
 */

function migrateResult(result: GeocodeResult | null | undefined): GeocodeResult | null {
  if (!result) return null

  return {
    ...result,
    candidates: result.candidates ?? [],
    attempts: result.attempts ?? [],
    notes: result.notes ?? [],
    ...(result.replaced ? { replaced: migrateResult(result.replaced) ?? undefined } : {}),
  } as GeocodeResult
}

export function migrateRecord(record: EstablishmentRecord): EstablishmentRecord {
  return {
    ...record,
    // Los registros guardados antes de que existieran los lotes van al lote
    // heredado, para que sigan siendo visibles y agrupables.
    batchId: record.batchId || LEGACY_BATCH_ID,
    fields: { ...emptyFields(), ...record.fields },
    original: record.original ?? {},
    result: migrateResult(record.result),
    rejected: (record.rejected ?? [])
      .map((entry) => migrateResult(entry))
      .filter((entry): entry is GeocodeResult => entry !== null),
  }
}

export function migrateRecords(records: readonly EstablishmentRecord[]): EstablishmentRecord[] {
  return records.map(migrateRecord)
}
