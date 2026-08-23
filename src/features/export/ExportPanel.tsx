import { useMemo, useState } from 'react'

import { useAppStore } from '@/app/store'
import { Button, Callout, Panel } from '@/components/ui/primitives'
import { STATUS_LABELS, type RecordStatus } from '@/domain/models/status'
import { buildExport } from '@/domain/services/exportBuilder'
import { downloadBlob, exportFileName, writeSheetToBlob } from '@/infrastructure/excel'

/**
 * Exportacion a .xlsx (spec seccion 17).
 *
 * Se conservan las columnas originales y se anaden los campos normalizados y
 * las columnas de resultado. Nunca se elimina informacion de entrada.
 */

type Scope = 'all' | 'located' | 'verified'

const SCOPE_LABELS: Record<Scope, string> = {
  all: 'Todos los registros',
  located: 'Solo los que tienen coordenadas',
  verified: 'Solo los verificados manualmente',
}

export function ExportPanel() {
  const records = useAppStore((state) => state.records)
  const batches = useAppStore((state) => state.batches)
  const [scope, setScope] = useState<Scope>('all')
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFile, setLastFile] = useState<string | null>(null)

  const selected = useMemo(() => {
    if (scope === 'located') return records.filter((record) => record.result !== null)
    if (scope === 'verified') {
      return records.filter((record) => record.result?.manuallyVerified === true)
    }
    return records
  }, [records, scope])

  const byStatus = useMemo(() => {
    const counts = new Map<RecordStatus, number>()
    for (const record of records) {
      counts.set(record.status, (counts.get(record.status) ?? 0) + 1)
    }
    return [...counts.entries()]
  }, [records])

  const sheet = useMemo(
    () => buildExport(selected.length === records.length ? records : selected, { batches }),
    [records, selected, batches],
  )

  const handleExport = () => {
    setIsWorking(true)
    setError(null)

    void writeSheetToBlob(sheet)
      .then((blob) => {
        const name = exportFileName()
        downloadBlob(blob, name)
        setLastFile(name)
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo generar el archivo.')
      })
      .finally(() => {
        setIsWorking(false)
      })
  }

  if (records.length === 0) {
    return (
      <Panel title="Exportar">
        <p className="text-ink-muted text-sm">No hay nada que exportar todavia.</p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Exportar a Excel"
      description="Se conservan todas las columnas del archivo original y se anaden los resultados."
      actions={
        <Button
          variant="primary"
          disabled={isWorking || selected.length === 0}
          onClick={handleExport}
        >
          {isWorking ? 'Generando...' : `Descargar ${String(selected.length)} registro(s)`}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-ink-muted text-xs font-medium tracking-wide uppercase">
            Que exportar
          </legend>
          {(Object.keys(SCOPE_LABELS) as Scope[]).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="export-scope"
                checked={scope === option}
                onChange={() => {
                  setScope(option)
                }}
              />
              {SCOPE_LABELS[option]}
            </label>
          ))}
        </fieldset>

        <div className="text-ink-muted text-xs">
          <p className="mb-1 font-medium">Contenido actual</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5">
            {byStatus.map(([status, count]) => (
              <li key={status}>
                {STATUS_LABELS[status]}: {count}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-ink-muted text-xs">
          <p className="mb-1 font-medium">Columnas del archivo ({sheet.headers.length})</p>
          <p className="font-mono break-words">{sheet.headers.join(' · ')}</p>
        </div>

        {selected.length === 0 ? (
          <Callout tone="warn">Ningun registro cumple el criterio elegido.</Callout>
        ) : null}
        {error ? <Callout tone="danger">{error}</Callout> : null}
        {lastFile ? <Callout tone="accent">Archivo generado: {lastFile}</Callout> : null}
      </div>
    </Panel>
  )
}
