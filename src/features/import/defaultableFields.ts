import { cellToString } from '@/domain/rules/text'
import {
  DEFAULTABLE_FIELDS,
  type ColumnAssignment,
  type DefaultableField,
} from '@/domain/services/recordNormalizer'
import type { SheetPreview } from '@/infrastructure/excel'

/**
 * Detecta que campos de la carga se quedarian vacios y admiten un valor escrito
 * a mano para todo el archivo.
 *
 * Funcion pura: recibe la vista previa y el mapeo, y no sabe nada de React.
 *
 * Importante sobre el recuento: la vista previa es una muestra (las primeras 25
 * filas), no el archivo entero. Por eso `blankInSample` se informa junto con
 * `sampleSize` y la interfaz no promete un total: decir "faltan 340 de 500" a
 * partir de 25 filas seria inventarse un dato.
 */

export interface DefaultableFieldStatus {
  readonly field: DefaultableField
  /** True si alguna columna del archivo esta asignada a este campo. */
  readonly isMapped: boolean
  /** Filas de la muestra que no traen valor para este campo. */
  readonly blankInSample: number
  readonly sampleSize: number
}

/** Columnas asignadas a un campo concreto. */
function columnsFor(mapping: ColumnAssignment, field: DefaultableField): number[] {
  const columns: number[] = []
  mapping.forEach((assigned, index) => {
    if (assigned === field) columns.push(index)
  })
  return columns
}

/**
 * Estado de cada campo con valor por defecto posible.
 *
 * Devuelve solo los que necesitan atencion: sin columna asignada, o con columna
 * pero con huecos en la muestra. Un campo mapeado y completo no se ofrece, para
 * no llenar la pantalla de casillas que nadie va a usar.
 */
export function analyzeDefaultableFields(
  preview: SheetPreview,
  mapping: ColumnAssignment,
): DefaultableFieldStatus[] {
  const sampleSize = preview.sampleRows.length

  return DEFAULTABLE_FIELDS.flatMap((field): DefaultableFieldStatus[] => {
    const columns = columnsFor(mapping, field)

    if (columns.length === 0) {
      // Sin columna asignada, ninguna fila traera el dato.
      return [{ field, isMapped: false, blankInSample: sampleSize, sampleSize }]
    }

    const blankInSample = preview.sampleRows.filter((row) =>
      // Varias columnas pueden alimentar el mismo campo: basta con que una
      // traiga algo para que la fila no cuente como hueco.
      columns.every((column) => cellToString(row[column]) === ''),
    ).length

    if (blankInSample === 0) return []
    return [{ field, isMapped: true, blankInSample, sampleSize }]
  })
}
