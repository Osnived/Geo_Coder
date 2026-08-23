import { useState } from 'react'

import { Button, Callout, Field, Panel, Select } from '@/components/ui/primitives'
import { FIELD_LABELS } from '@/domain/models/fields'
import { useAppStore } from '@/app/store'
import { ColumnMapper } from '@/features/column-mapping/ColumnMapper'

import type { SheetPreview } from '@/infrastructure/excel'

import { FileDropzone } from './FileDropzone'
import { PreviewTable } from './PreviewTable'

function previewDescription(preview: SheetPreview): string {
  const skipped = preview.totalDataRows - preview.nonBlankDataRows
  const base = `${String(preview.totalDataRows)} fila(s) de datos, se muestran las primeras ${String(preview.sampleRows.length)}.`
  return skipped > 0 ? `${base} ${String(skipped)} fila(s) en blanco no generaran registro.` : base
}

/** Flujo completo de importacion: archivo -> hoja -> encabezados -> mapeo. */
export function ImportPanel() {
  const {
    fileName,
    sheets,
    selectedSheet,
    preview,
    mapping,
    displacedColumns,
    isLoadingFile,
    importError,
    openFile,
    selectSheet,
    setHeaderRow,
    setColumnField,
    resetMappingToSuggestion,
    clearImport,
    confirmImport,
  } = useAppStore()

  const [lastImported, setLastImported] = useState<number | null>(null)

  const mappedCount = mapping.filter((field) => field !== null).length

  const handleConfirm = async () => {
    const count = await confirmImport()
    setLastImported(count)
    if (count > 0) clearImport()
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="1. Archivo"
        description="Los datos se procesan en tu navegador. Nada se envia a ningun servidor."
        actions={
          fileName ? (
            <Button
              variant="ghost"
              onClick={() => {
                clearImport()
                setLastImported(null)
              }}
            >
              Quitar archivo
            </Button>
          ) : undefined
        }
      >
        {fileName ? (
          <p className="text-sm">
            <span className="font-medium">{fileName}</span>
            <span className="text-ink-muted"> · {sheets.length} hoja(s)</span>
          </p>
        ) : (
          <FileDropzone
            isLoading={isLoadingFile}
            onFile={(file) => {
              setLastImported(null)
              void openFile(file)
            }}
          />
        )}

        {importError ? (
          <div className="mt-3">
            <Callout tone="danger">{importError}</Callout>
          </div>
        ) : null}

        {lastImported !== null && lastImported > 0 ? (
          <div className="mt-3">
            <Callout tone="accent">
              Se agregaron {lastImported} registro(s). Revisalos en la pestana Registros.
            </Callout>
          </div>
        ) : null}
      </Panel>

      {sheets.length > 0 ? (
        <Panel
          title="2. Hoja"
          description="Elige la hoja y confirma cual fila trae los encabezados."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hoja">
              <Select
                value={selectedSheet ?? ''}
                onChange={(event) => {
                  selectSheet(event.target.value)
                }}
              >
                <option value="" disabled>
                  Selecciona una hoja
                </option>
                {sheets.map((sheet) => (
                  <option key={sheet.name} value={sheet.name} disabled={sheet.isEmpty}>
                    {sheet.name}
                    {sheet.isEmpty
                      ? ' (vacia)'
                      : ` — ${String(sheet.rowCount)} filas, ${String(sheet.columnCount)} columnas`}
                  </option>
                ))}
              </Select>
            </Field>

            {preview ? (
              <Field
                label="Fila de encabezados"
                hint="Se detecta automaticamente. Cambiala si el archivo tiene titulos arriba."
              >
                <input
                  type="number"
                  min={1}
                  value={preview.headerRowNumber}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isInteger(value) && value >= 1) setHeaderRow(value)
                  }}
                  className="border-border-subtle bg-surface w-full rounded-md border px-2.5 py-1.5 text-sm"
                />
              </Field>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {preview ? (
        <>
          <Panel title="3. Vista previa" description={previewDescription(preview)}>
            <PreviewTable preview={preview} />
          </Panel>

          <Panel
            title="4. Mapeo de columnas"
            description="La deteccion automatica es una sugerencia: revisa y corrige lo que haga falta."
            actions={
              <Button variant="ghost" onClick={resetMappingToSuggestion}>
                Restaurar sugerencia
              </Button>
            }
          >
            <ColumnMapper
              preview={preview}
              mapping={mapping}
              displacedColumns={displacedColumns}
              onChange={setColumnField}
            />

            {mappedCount === 0 ? (
              <div className="mt-3">
                <Callout tone="warn">
                  No hay ninguna columna mapeada. Los registros se importarian vacios.
                </Callout>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-ink-muted text-xs">
                {mappedCount} de {mapping.length} columnas mapeadas a:{' '}
                {mapping
                  .filter((field) => field !== null)
                  .map((field) => FIELD_LABELS[field])
                  .join(', ') || '—'}
              </p>
              <Button variant="primary" onClick={() => void handleConfirm()}>
                Agregar {preview.nonBlankDataRows} registro(s)
              </Button>
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  )
}
