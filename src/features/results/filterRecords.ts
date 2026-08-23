import type { EstablishmentRecord } from '@/domain/models/record'
import { canonicalize } from '@/domain/rules/text'
import { validateRecord, type ValidationOptions } from '@/domain/rules/validation'
import type { RecordFilters } from '@/app/store/types'

/** Filtrado de la tabla de registros. Funcion pura, sin estado ni React. */

function matchesText(record: EstablishmentRecord, needle: string): boolean {
  if (needle === '') return true
  const haystack = canonicalize(Object.values(record.fields).join(' '))
  return haystack.includes(needle)
}

export function filterRecords(
  records: readonly EstablishmentRecord[],
  filters: RecordFilters,
  validationOptions: ValidationOptions,
): EstablishmentRecord[] {
  const needle = canonicalize(filters.text)

  return records.filter((record) => {
    if (filters.source !== 'all' && record.source !== filters.source) return false
    if (filters.status !== 'all' && record.status !== filters.status) return false
    if (!matchesText(record, needle)) return false
    if (filters.onlyWithIssues && validateRecord(record, validationOptions).length === 0) {
      return false
    }
    return true
  })
}
