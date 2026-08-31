import { useState } from 'react'

import { useNavigation } from '@/app/navigationContext'
import { useAppStore } from '@/app/store'
import { Button } from '@/components/ui/primitives'
import { Tabs, TabPanel, type TabOption } from '@/components/ui/Tabs'
import { ImportPanel } from '@/features/import/ImportPanel'
import { ManualEntryForm } from '@/features/manual-entry/ManualEntryForm'
import { GeocodingSettingsPanel } from '@/features/settings/GeocodingSettingsPanel'

import { GroupList } from './GroupList'

/**
 * Unica entrada de datos de la aplicacion.
 *
 * Antes habia tres secciones —importar, entrada manual y registros— para lo que
 * es un solo paso del trabajo: meter datos y comprobar que entraron. Ahora el
 * metodo de ingreso es una pestana dentro de la vista y el resultado aparece
 * debajo, sin cambiar de pantalla.
 *
 * La configuracion del procesamiento vive aqui porque se decide con los datos
 * delante, antes de lanzar la geocodificacion.
 */

type Method = 'excel' | 'manual'

const METHODS: readonly TabOption<Method>[] = [
  { id: 'excel', label: 'Carga masiva' },
  { id: 'manual', label: 'Ingreso manual' },
]

export function DataPanel() {
  const [method, setMethod] = useState<Method>('excel')
  const records = useAppStore((state) => state.records)
  const batches = useAppStore((state) => state.batches)
  const pending = records.filter(
    (record) => record.status === 'PENDING' || record.status === 'ERROR',
  ).length
  const { go } = useNavigation()

  return (
    // Dos columnas en pantallas anchas: se mete y se comprueba a la vez, sin
    // desplazarse. En estrechas se apilan y la pagina se desplaza.
    <div className="grid gap-4 lg:min-h-0 lg:flex-1 xl:grid-cols-[minmax(0,3fr)_minmax(22rem,1fr)]">
      <section
        aria-label="Ingreso de datos"
        className="border-border-subtle bg-surface flex flex-col overflow-hidden rounded-lg border lg:min-h-0"
      >
        <div className="px-4 pt-3">
          <h2 className="text-sm font-semibold">Ingreso de datos</h2>
          <p className="text-ink-muted mt-0.5 mb-2 text-xs">
            Todo se procesa en tu navegador. Cada carga forma su propio grupo.
          </p>
        </div>

        <div className="px-4">
          <Tabs label="Metodo de ingreso" options={METHODS} value={method} onChange={setMethod} />
        </div>

        {/* El unico bloque que crece: se desplaza por dentro. */}
        <TabPanel id={method} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {method === 'excel' ? <ImportPanel /> : <ManualEntryForm />}
        </TabPanel>
      </section>

      <div className="flex flex-col gap-4 lg:min-h-0">
        <section
          aria-label="Registros ingresados"
          className="border-border-subtle bg-surface flex flex-col overflow-hidden rounded-lg border lg:min-h-0 lg:flex-1"
        >
          <header className="border-border-subtle flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Registros ingresados</h2>
              <p className="text-ink-muted mt-0.5 text-xs">
                {records.length} registro(s) en {batches.length} grupo(s)
              </p>
            </div>
            {pending > 0 ? (
              <Button
                variant="primary"
                onClick={() => {
                  go('search')
                }}
              >
                Procesar {pending}
              </Button>
            ) : null}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <GroupList />
          </div>
        </section>

        <section
          aria-label="Configuracion de geocodificacion"
          className="border-border-subtle bg-surface shrink-0 rounded-lg border"
        >
          <header className="border-border-subtle border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Configuracion de geocodificacion</h2>
          </header>
          <div className="px-4 py-3">
            <GeocodingSettingsPanel />
          </div>
        </section>
      </div>
    </div>
  )
}
