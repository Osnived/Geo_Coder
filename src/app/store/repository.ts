import {
  createInMemoryRepository,
  createRecordRepository,
  isIndexedDbAvailable,
  type RecordRepository,
} from '@/infrastructure/storage'

/**
 * Repositorio unico de la aplicacion.
 *
 * Si IndexedDB no esta disponible (modo privado en algunos navegadores) se
 * degrada a memoria en lugar de fallar: se pierde la persistencia entre
 * recargas, no los datos de la sesion (spec principio 8).
 */

let instance: RecordRepository | null = null

export function getRepository(): RecordRepository {
  instance ??= isIndexedDbAvailable() ? createRecordRepository() : createInMemoryRepository()
  return instance
}

/** Solo para tests: sustituye el repositorio global. */
export function setRepository(repository: RecordRepository | null): void {
  instance = repository
}

/** True si la sesion se esta guardando de verdad en disco. */
export const persistenceAvailable = isIndexedDbAvailable()
