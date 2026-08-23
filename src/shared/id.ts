/** Identificador interno unico por registro (spec seccion 3). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Respaldo para entornos sin Web Crypto (tests, navegadores antiguos).
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Marca de tiempo ISO. Centralizada para poder fijarla en los tests. */
export function nowIso(): string {
  return new Date().toISOString()
}
