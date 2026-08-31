import { Badge } from '@/components/ui/primitives'
import { FIELD_LABELS } from '@/domain/models/fields'
import type { GeocodeQuery } from '@/domain/models/geocode'

/**
 * Muestra la cascada de consultas de un registro antes de gastar una sola
 * peticion. Responde a "que se va a buscar exactamente" (spec principio 7).
 */
export function QueryPreview({ queries }: { queries: readonly GeocodeQuery[] }) {
  if (queries.length === 0) {
    return (
      <p className="text-ink-muted text-xs italic">
        Sin datos suficientes para construir una busqueda.
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {queries.map((query) => (
        <li key={query.templateId} className="flex flex-wrap items-baseline gap-2 text-xs">
          <Badge tone={query.strategy === 0 ? 'accent' : 'neutral'}>
            {query.strategy === 0 ? 'principal' : `alt. ${String(query.strategy)}`}
          </Badge>
          <code className="text-ink font-mono">{query.text}</code>
          <span
            className="text-ink-muted"
            title={query.usedFields.map((field) => FIELD_LABELS[field]).join(' + ')}
          >
            ({query.usedFields.length} campo(s))
          </span>
        </li>
      ))}
    </ol>
  )
}
