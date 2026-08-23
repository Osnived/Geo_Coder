import { useMemo } from 'react'

import { useAppStore } from '@/app/store'
import { Callout, Panel } from '@/components/ui/primitives'
import { buildQueries } from '@/domain/services/queryBuilder'

import { QueryPreview } from './QueryPreview'

/** Vista previa de lo que se buscara, registro por registro. */
export function SearchPanel() {
  const records = useAppStore((state) => state.records)
  const country = useAppStore((state) => state.country)

  const plan = useMemo(
    () =>
      records.map((record) => ({
        record,
        queries: buildQueries(record, { sessionCountry: country }),
      })),
    [records, country],
  )

  const searchable = plan.filter((entry) => entry.queries.length > 0).length

  if (records.length === 0) {
    return (
      <Panel title="Plan de busqueda">
        <p className="text-ink-muted text-sm">
          Todavia no hay registros. Importa un Excel o crea uno manualmente.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Plan de busqueda"
      description="Esto es exactamente lo que se enviara al proveedor. Todavia no se ha hecho ninguna peticion."
    >
      <div className="flex flex-col gap-3">
        {searchable < records.length ? (
          <Callout tone="warn">
            {records.length - searchable} de {records.length} registro(s) no tienen datos
            suficientes para buscarse. Completalos en la pestana Registros.
          </Callout>
        ) : null}

        <div className="flex flex-col gap-2">
          {plan.map(({ record, queries }) => (
            <details
              key={record.id}
              className="border-border-subtle rounded-md border px-3 py-2"
              open={records.length <= 10}
            >
              <summary className="cursor-pointer text-sm font-medium">
                {record.fields.location_name ||
                  record.fields.client ||
                  record.fields.address ||
                  '(registro sin nombre)'}
                <span className="text-ink-faint ml-2 text-xs font-normal">
                  {queries.length} estrategia(s)
                </span>
              </summary>
              <div className="mt-2">
                <QueryPreview queries={queries} />
              </div>
            </details>
          ))}
        </div>
      </div>
    </Panel>
  )
}
