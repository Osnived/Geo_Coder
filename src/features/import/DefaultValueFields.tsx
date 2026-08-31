import { Callout, Field, TextInput } from '@/components/ui/primitives'
import { FIELD_LABELS } from '@/domain/models/fields'
import type { FieldDefaults } from '@/domain/services/recordNormalizer'

import type { DefaultableFieldStatus } from './defaultableFields'

/**
 * Valores que se escriben una vez y se aplican a toda la carga.
 *
 * Nace de un caso concreto: un Excel de tiendas de una sola cadena rara vez
 * repite el nombre de la cadena en cada fila, porque quien lo hizo ya sabia de
 * quien era el archivo. Sin ese dato, la busqueda pierde una senal que pesa un
 * 20% en el scoring.
 *
 * El aviso de que el valor se aplica a todo el archivo es parte del control, no
 * un adorno: escribir aqui toca cientos de registros de una vez.
 */

export function DefaultValueFields({
  statuses,
  defaults,
  recordCount,
  onChange,
}: {
  /** Campos que se quedarian vacios. Si esta vacio, no se muestra nada. */
  statuses: readonly DefaultableFieldStatus[]
  defaults: FieldDefaults
  /** Registros que generara esta carga, para decirlo con un numero real. */
  recordCount: number
  onChange: (field: keyof FieldDefaults, value: string) => void
}) {
  if (statuses.length === 0) return null

  const filled = statuses.filter((status) => (defaults[status.field] ?? '').trim() !== '')

  return (
    <div className="border-border-subtle bg-surface-muted flex flex-col gap-3 rounded-md border px-3 py-3">
      <div>
        <h4 className="text-sm font-semibold">Completar datos que faltan</h4>
        {/*
          La frase es deliberadamente neutra: en un mismo archivo puede haber un
          campo sin columna y otro con columna a medias. Lo preciso lo dice la
          ayuda de cada campo, que sabe en cual de los dos casos esta.
        */}
        <p className="text-ink-muted mt-0.5 text-xs">
          Estos datos faltan en todo el archivo o en algunas filas. Puedes escribir el valor una vez
          y se usara para toda la carga.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {statuses.map((status) => (
          <Field
            key={status.field}
            label={FIELD_LABELS[status.field]}
            hint={
              status.isMapped
                ? `Hay una columna asignada, pero ${String(status.blankInSample)} de las ${String(status.sampleSize)} filas de la muestra la traen vacia.`
                : 'Ninguna columna del archivo esta asignada a este campo.'
            }
          >
            <TextInput
              value={defaults[status.field] ?? ''}
              onChange={(event) => {
                onChange(status.field, event.target.value)
              }}
            />
          </Field>
        ))}
      </div>

      {/*
        El aviso concreto solo aparece cuando hay algo escrito: antes de eso no
        hay nada que advertir, y un aviso permanente se deja de leer.
      */}
      {filled.length > 0 ? (
        <Callout tone="warn">
          Se aplicara a los <strong>{recordCount}</strong> registro(s) de esta carga que no traigan
          el dato. Los que si lo traigan se quedan como estan, y las columnas originales del archivo
          no se modifican.
        </Callout>
      ) : null}
    </div>
  )
}
