import { lazy, Suspense, useEffect, useState } from 'react'

import { persistenceAvailable, useAppStore } from '@/app/store'
import { Callout } from '@/components/ui/primitives'
import { ExportPanel } from '@/features/export/ExportPanel'
import { ImportPanel } from '@/features/import/ImportPanel'
import { ManualEntryForm } from '@/features/manual-entry/ManualEntryForm'
import { RecordsTable } from '@/features/results/RecordsTable'
import { SearchPanel } from '@/features/search/SearchPanel'
import { AiSettingsPanel } from '@/features/settings/AiSettingsPanel'
import { cx } from '@/shared/cx'

import { Sidebar } from './Sidebar'
import { FULL_HEIGHT_TABS, TABS, type Tab } from './tabs'

// Leaflet pesa lo suyo: solo se descarga al abrir las vistas que lo usan.
const ReviewPanel = lazy(() =>
  import('@/features/review/ReviewPanel').then((module) => ({ default: module.ReviewPanel })),
)
const GlobalMapPanel = lazy(() =>
  import('@/features/map/GlobalMapPanel').then((module) => ({ default: module.GlobalMapPanel })),
)

function Loading({ label }: { label: string }) {
  return <p className="text-ink-muted py-10 text-center text-sm">{label}</p>
}

export function App() {
  const hydrate = useAppStore((state) => state.hydrate)
  const isHydrated = useAppStore((state) => state.isHydrated)
  const [tab, setTab] = useState<Tab>('import')
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  const fillsHeight = FULL_HEIGHT_TABS.has(tab)

  return (
    <div className="relative flex h-screen overflow-hidden">
      <Sidebar
        tab={tab}
        open={navOpen}
        onSelect={(next) => {
          setTab(next)
          setNavOpen(false)
        }}
      />

      {navOpen ? (
        <button
          type="button"
          aria-label="Cerrar el menu"
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => {
            setNavOpen(false)
          }}
        />
      ) : null}

      <main
        className={cx(
          'flex min-w-0 flex-1 flex-col gap-4 px-4 py-4',
          // Las vistas altas no desplazan la pagina: lo hacen por dentro.
          fillsHeight ? 'overflow-hidden' : 'overflow-y-auto',
        )}
      >
        <button
          type="button"
          onClick={() => {
            setNavOpen(true)
          }}
          className="border-border-subtle bg-surface text-ink flex shrink-0 items-center gap-2 self-start rounded-md border px-3 py-1.5 text-sm font-medium md:hidden"
        >
          <span aria-hidden="true">☰</span>
          {TABS.find((entry) => entry.id === tab)?.label ?? 'Secciones'}
        </button>

        {!persistenceAvailable ? (
          <Callout tone="warn">
            IndexedDB no esta disponible en este navegador. La sesion funcionara, pero no se
            guardara al recargar la pagina.
          </Callout>
        ) : null}

        {!isHydrated ? (
          <Loading label="Cargando sesion..." />
        ) : (
          <div className={cx(fillsHeight && 'flex min-h-0 flex-1 flex-col')}>
            {tab === 'import' ? <ImportPanel /> : null}
            {tab === 'manual' ? <ManualEntryForm /> : null}
            {tab === 'records' ? <RecordsTable /> : null}
            {tab === 'search' ? <SearchPanel /> : null}
            {tab === 'review' ? (
              <Suspense fallback={<Loading label="Cargando mapa..." />}>
                <ReviewPanel />
              </Suspense>
            ) : null}
            {tab === 'mapa' ? (
              <Suspense fallback={<Loading label="Cargando mapa..." />}>
                <GlobalMapPanel />
              </Suspense>
            ) : null}
            {tab === 'export' ? <ExportPanel /> : null}
            {tab === 'settings' ? <AiSettingsPanel /> : null}
          </div>
        )}
      </main>
    </div>
  )
}
