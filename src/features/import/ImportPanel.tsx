import { useState } from 'react'

import { Button, Callout, Field, Section, Select } from '@/components/ui/primitives'
import { FIELD_LABELS } from '@/domain/models/fields'
import { useAppStore } from '@/app/store'
import { ColumnMapper } from '@/features/column-mapping/ColumnMapper'

import type { SheetPreview } from '@/infrastructure/excel'

import { FileDropzone } from './FileDropzone'
import { TemplateButton } from './TemplateButton'
import { PreviewTable } from './PreviewTable'

/**
 * Flujo de importacion: archivo -> hoja -> encabezados -> mapeo.
 *
 * Se monta dentro de la pestana "Carga masiva" de la vista Datos, asi que no
 * lleva tarjeta propia: cada paso es una seccion del mismo panel.
 */

function previewDescription(preview: SheetPreview): string {
  const skipped = preview.totalDataRows - preview.nonBlankDataRows
  const base = `${String(preview.totalDataRows)} fila(s) de datos, se muestran las primeras ${String(preview.sampleRows.length)}.`
  return skipped > 0 ? `${base} ${String(skipped)} fila(s) en blanco no generaran registro.` : base
}

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
    ai,
    aiBusy,
    assistColumnMapping,
  } = useAppStore()

  const [lastImported, setLastImported] = useState<number | null>(null)
  const [aiApplied, setAiApplied] = useState<number | null>(null)

  const mappedCount = mapping.filter((field) => field !== null).length

  const handleConfirm = async () => {
    const count = await confirmImport()
    setLastImported(count)
    if (count > 0) clearImport()
  }

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="1. Archivo"
        description="Cada archivo que cargues forma su propio grupo de registros."
        actions={
          <>
            <TemplateButton />
            {fileName ? (
              <Button
                variant="ghost"
                onClick={() => {
                  clearImport()
                  setLastImported(null)
                }}
              >
                Quitar archivo
              </Button>
            ) : null}
          </>
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

        {importError ? <Callout tone="danger">{importError}</Callout> : null}

        {!fileName ? (
          <p className="text-ink-muted text-xs">
            ¿No sabes como estructurar el archivo? Descarga la plantilla: trae los encabezados que
            la aplicacion reconoce sola, filas de ejemplo y una hoja con instrucciones.
          </p>
        ) : null}

        {lastImported !== null && lastImported > 0 ? (
          <Callout tone="ok">
            {lastImported} registro(s) cargados. Ya estan en el grupo de la derecha.
          </Callout>
        ) : null}
      </Section>

      {sheets.length > 0 ? (
        <Section
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
                  className="border-border-subtle bg-surface text-ink w-full rounded-md border px-2.5 py-1.5 text-sm tabular-nums"
                />
              </Field>
            ) : null}
          </div>
        </Section>
      ) : null}

      {preview ? (
        <>
          <Section title="3. Vista previa" description={previewDescription(preview)}>
            <PreviewTable preview={preview} />
          </Section>

          <Section
            title="4. Mapeo de columnas"
            description="La deteccion automatica es una sugerencia: revisa y corrige lo que haga falta."
            actions={
              <>
                {ai.enabled ? (
                  <Button
                    disabled={aiBusy}
                    onClick={() => {
                      void assistColumnMapping().then(setAiApplied)
                    }}
                    title="Pregunta al asistente solo por las columnas sin reconocer"
                  >
                    {aiBusy ? 'Consultando...' : 'Ayuda de IA'}
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={resetMappingToSuggestion}>
                  Restaurar sugerencia
                </Button>
              </>
            }
          >
            <ColumnMapper
              preview={preview}
              mapping={mapping}
              displacedColumns={displacedColumns}
              onChange={setColumnField}
            />

            {aiApplied !== null ? (
              <Callout tone={aiApplied > 0 ? 'accent' : 'warn'}>
                {aiApplied > 0
                  ? `El asistente resolvio ${String(aiApplied)} columna(s). Revisalas: siguen siendo sugerencias.`
                  : 'El asistente no pudo resolver ninguna columna.'}
              </Callout>
            ) : null}

            {mappedCount === 0 ? (
              <Callout tone="warn">
                No hay ninguna columna mapeada. Los registros se importarian vacios.
              </Callout>
            ) : null}

            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
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
          </Section>
        </>
      ) : null}
    </div>
  )
}
