import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import { persistenceAvailable, useAppStore } from '@/app/store'
import { Button, Callout } from '@/components/ui/primitives'
import { DataPanel } from '@/features/data/DataPanel'
import { ExportPanel } from '@/features/export/ExportPanel'
import { RecordsTable } from '@/features/results/RecordsTable'
import { SearchPanel } from '@/features/search/SearchPanel'
import { AiSettingsPanel } from '@/features/settings/AiSettingsPanel'
import { cx } from '@/shared/cx'

import { NavigationProvider } from './navigation'
import { Sidebar } from './Sidebar'
import { FULL_HEIGHT_TABS, PARENT_TAB, TAB_LABELS, type Tab } from './tabs'

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
  const [tab, setTab] = useState<Tab>('data')
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  const go = useCallback((next: Tab) => {
    setTab(next)
    setNavOpen(false)
  }, [])

  const navigation = useMemo(() => ({ current: tab, go }), [tab, go])

  const fillsHeight = FULL_HEIGHT_TABS.has(tab)
  const parent = PARENT_TAB[tab]

  return (
    <NavigationProvider value={navigation}>
      <div className="relative flex h-screen overflow-hidden">
        <Sidebar tab={tab} open={navOpen} onSelect={go} />

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
            'flex min-w-0 flex-1 flex-col gap-3 px-4 py-4',
            // Las vistas altas no desplazan la pagina: lo hacen por dentro.
            // Por debajo de `lg` apilan sus columnas y, si necesitan mas alto
            // que la ventana, la pagina se desplaza.
            fillsHeight ? 'overflow-y-auto lg:overflow-hidden' : 'overflow-y-auto',
          )}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setNavOpen(true)
              }}
              className="border-border-strong bg-surface text-ink flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium md:hidden"
            >
              <span aria-hidden="true">☰</span>
              {TAB_LABELS[tab]}
            </button>

            {/* Las vistas sin entrada propia en la barra necesitan una salida. */}
            {parent ? (
              <Button
                variant="ghost"
                onClick={() => {
                  go(parent)
                }}
              >
                <span aria-hidden="true">←</span> Volver a {TAB_LABELS[parent]}
              </Button>
            ) : null}
          </div>

          {!persistenceAvailable ? (
            <Callout tone="warn">
              IndexedDB no esta disponible en este navegador. La sesion funcionara, pero no se
              guardara al recargar la pagina.
            </Callout>
          ) : null}

          {!isHydrated ? (
            <Loading label="Cargando sesion..." />
          ) : (
            <div className={cx(fillsHeight && 'flex flex-col lg:min-h-0 lg:flex-1')}>
              {tab === 'data' ? <DataPanel /> : null}
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
    </NavigationProvider>
  )
}
