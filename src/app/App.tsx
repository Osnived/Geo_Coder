import { lazy, Suspense, useEffect, useState } from 'react'

import { persistenceAvailable, useAppStore } from '@/app/store'
import { Callout } from '@/components/ui/primitives'
import { ExportPanel } from '@/features/export/ExportPanel'
import { ImportPanel } from '@/features/import/ImportPanel'
import { ManualEntryForm } from '@/features/manual-entry/ManualEntryForm'
import { RecordsTable } from '@/features/results/RecordsTable'
import { SearchPanel } from '@/features/search/SearchPanel'
import { AiSettingsPanel } from '@/features/settings/AiSettingsPanel'
import { CountrySelector } from '@/features/settings/CountrySelector'
import { cx } from '@/shared/cx'

// Leaflet pesa lo suyo: solo se descarga al abrir la revision.
const ReviewPanel = lazy(() =>
  import('@/features/review/ReviewPanel').then((module) => ({ default: module.ReviewPanel })),
)

type Tab = 'import' | 'manual' | 'records' | 'search' | 'review' | 'export' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'import', label: 'Importar Excel' },
  { id: 'manual', label: 'Entrada manual' },
  { id: 'records', label: 'Registros' },
  { id: 'search', label: 'Busqueda' },
  { id: 'review', label: 'Revision' },
  { id: 'export', label: 'Exportar' },
  { id: 'settings', label: 'Ajustes' },
]

export function App() {
  const hydrate = useAppStore((state) => state.hydrate)
  const isHydrated = useAppStore((state) => state.isHydrated)
  const recordCount = useAppStore((state) => state.records.length)
  const [tab, setTab] = useState<Tab>('import')

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Geolocator</h1>
          <p className="text-ink-muted text-xs">
            Geolocalizacion de establecimientos, en tu maquina.
          </p>
        </div>
        <CountrySelector />
      </header>

      {!persistenceAvailable ? (
        <Callout tone="warn">
          IndexedDB no esta disponible en este navegador. La sesion funcionara, pero no se guardara
          al recargar la pagina.
        </Callout>
      ) : null}

      <nav className="border-border-subtle bg-surface flex gap-1 rounded-lg border p-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setTab(entry.id)
            }}
            className={cx(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === entry.id
                ? 'bg-accent text-white'
                : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
            )}
          >
            {entry.label}
            {entry.id === 'records' && recordCount > 0 ? ` (${String(recordCount)})` : ''}
          </button>
        ))}
      </nav>

      <main>
        {!isHydrated ? (
          <p className="text-ink-muted py-10 text-center text-sm">Cargando sesion...</p>
        ) : (
          <>
            {tab === 'import' ? <ImportPanel /> : null}
            {tab === 'manual' ? <ManualEntryForm /> : null}
            {tab === 'records' ? <RecordsTable /> : null}
            {tab === 'search' ? <SearchPanel /> : null}
            {tab === 'review' ? (
              <Suspense
                fallback={
                  <p className="text-ink-muted py-10 text-center text-sm">Cargando mapa...</p>
                }
              >
                <ReviewPanel />
              </Suspense>
            ) : null}
            {tab === 'export' ? <ExportPanel /> : null}
            {tab === 'settings' ? <AiSettingsPanel /> : null}
          </>
        )}
      </main>
    </div>
  )
}
