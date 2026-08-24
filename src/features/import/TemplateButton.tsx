import { useState } from 'react'

import { Button } from '@/components/ui/primitives'
import { buildTemplateWorkbook, INSTRUCTIONS_SHEET_NAME } from '@/domain/services/templateBuilder'
import { downloadBlob, writeWorkbookToBlob } from '@/infrastructure/excel'

/**
 * Descarga la plantilla de carga.
 *
 * El archivo se genera en el momento a partir del mismo codigo que define los
 * campos, en lugar de servir un .xlsx guardado: asi no puede quedarse
 * desactualizado respecto a lo que la aplicacion entiende.
 */

const FILE_NAME = 'plantilla-geolocator.xlsx'

export function TemplateButton({ variant = 'secondary' }: { variant?: 'secondary' | 'primary' }) {
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = () => {
    setIsWorking(true)
    setError(null)

    void writeWorkbookToBlob(
      buildTemplateWorkbook().map((entry) => ({
        name: entry.name,
        sheet: entry.sheet,
        // La hoja de instrucciones es texto corrido: el autofiltro estorba.
        asTable: entry.name !== INSTRUCTIONS_SHEET_NAME,
      })),
    )
      .then((blob) => {
        downloadBlob(blob, FILE_NAME)
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo generar la plantilla.')
      })
      .finally(() => {
        setIsWorking(false)
      })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={variant}
        disabled={isWorking}
        onClick={handleDownload}
        title="Excel de ejemplo con los encabezados que la aplicacion reconoce sola"
      >
        {isWorking ? 'Generando...' : 'Descargar plantilla'}
      </Button>
      {error ? <span className="text-danger text-xs">{error}</span> : null}
    </div>
  )
}
