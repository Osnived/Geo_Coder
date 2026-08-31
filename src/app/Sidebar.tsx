import { useAppStore } from '@/app/store'
import { CountrySelector } from '@/features/settings/CountrySelector'
import { needsReview } from '@/domain/services/reviewService'
import { cx } from '@/shared/cx'

import { TAB_GROUPS, type Tab } from './tabs'

/**
 * Navegacion lateral.
 *
 * Va a la izquierda y no arriba porque la aplicacion es de trabajo con tablas y
 * mapas anchos: en horizontal, las secciones se comian una franja de alto util
 * en todas las pantallas.
 *
 * Las entradas siguen el flujo —datos, procesamiento, revision, exportacion— y
 * llevan el recuento de lo que queda por hacer en cada etapa, para que se vea
 * donde esta el trabajo sin entrar a mirar.
 */

export function Sidebar({
  tab,
  onSelect,
  open,
}: {
  tab: Tab
  onSelect: (next: Tab) => void
  /** Solo cuenta por debajo de `md`: en pantallas anchas siempre esta visible. */
  open: boolean
}) {
  const recordCount = useAppStore((state) => state.records.length)
  const pending = useAppStore(
    (state) =>
      state.records.filter((record) => record.status === 'PENDING' || record.status === 'ERROR')
        .length,
  )
  const toReview = useAppStore(
    (state) => state.records.filter((record) => needsReview(record)).length,
  )
  const located = useAppStore(
    (state) => state.records.filter((record) => record.result !== null).length,
  )

  const badgeFor = (id: Tab): number | null => {
    if (id === 'data') return recordCount || null
    if (id === 'search') return pending || null
    if (id === 'review') return toReview || null
    if (id === 'mapa') return located || null
    if (id === 'export') return recordCount || null
    return null
  }

  return (
    <aside
      className={cx(
        'border-border-subtle bg-surface w-60 shrink-0 flex-col border-r',
        // En pantallas estrechas ocuparia dos tercios del ancho: se muestra
        // como capa por encima y solo cuando se pide.
        open
          ? 'absolute inset-y-0 left-0 z-30 flex shadow-lg md:static md:shadow-none'
          : 'hidden md:flex',
      )}
    >
      <div className="border-border-subtle border-b px-4 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Geolocator</h1>
        <p className="text-ink-muted mt-0.5 text-xs">
          Geolocalizacion de establecimientos, en tu maquina.
        </p>
      </div>

      <nav aria-label="Secciones" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {TAB_GROUPS.map((group) => (
          <div key={group.name} className="mb-3">
            <p className="text-ink-muted px-2 pb-1 text-[0.65rem] font-semibold tracking-wide uppercase">
              {group.name}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.tabs.map((entry) => {
                const badge = badgeFor(entry.id)
                const active = tab === entry.id

                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(entry.id)
                      }}
                      aria-current={active ? 'page' : undefined}
                      title={entry.hint}
                      className={cx(
                        'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-accent text-white'
                          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                      )}
                    >
                      <span className="truncate">{entry.label}</span>
                      {badge !== null ? (
                        <span
                          className={cx(
                            'rounded px-1.5 py-0.5 text-xs tabular-nums',
                            active ? 'bg-white/25' : 'bg-surface-sunken text-ink-muted',
                          )}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-border-subtle border-t px-3 py-3">
        <CountrySelector layout="stacked" />
      </div>
    </aside>
  )
}
