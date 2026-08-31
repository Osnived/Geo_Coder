import { useAppStore } from '@/app/store'
import { Callout, Field, Panel, TextInput } from '@/components/ui/primitives'

/**
 * Ajustes de la capa de IA opcional (spec seccion 22).
 *
 * Apagada de fabrica. Solo se usa donde las reglas deterministas ya se
 * rindieron: columnas sin reconocer y registros sin resultado.
 */
export function AiSettingsPanel() {
  const ai = useAppStore((state) => state.ai)
  const setAiSettings = useAppStore((state) => state.setAiSettings)

  return (
    <Panel
      title="Asistente de IA (opcional)"
      description="Apagado por defecto. La aplicacion funciona igual sin el."
    >
      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={ai.enabled}
            onChange={(event) => {
              setAiSettings({ enabled: event.target.checked })
            }}
          />
          <span>
            Activar asistente
            <span className="text-ink-muted block text-xs">
              Se usa solo en dos sitios: interpretar columnas que la deteccion automatica no
              reconocio, y proponer busquedas alternativas cuando un registro no se encuentra. Nunca
              sustituye a una regla determinista.
            </span>
          </span>
        </label>

        <Callout tone="accent">
          Se conecta a un modelo que corre en <strong>tu propia maquina</strong> (Ollama, LM Studio
          o similar) mediante su API compatible con OpenAI. No se usa ningun servicio de pago ni
          hace falta clave: una clave de API en el navegador quedaria a la vista de cualquiera. Para
          un modelo alojado, apunta el endpoint a un proxy propio.
        </Callout>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Endpoint" hint="API compatible con OpenAI">
            <TextInput
              value={ai.endpoint}
              disabled={!ai.enabled}
              onChange={(event) => {
                setAiSettings({ endpoint: event.target.value })
              }}
            />
          </Field>
          <Field label="Modelo" hint="Debe estar descargado en tu equipo">
            <TextInput
              value={ai.model}
              disabled={!ai.enabled}
              onChange={(event) => {
                setAiSettings({ model: event.target.value })
              }}
            />
          </Field>
        </div>

        {ai.enabled ? (
          <Callout tone="warn">
            Si no hay ningun modelo escuchando en ese endpoint, el asistente no hara nada y la
            aplicacion seguira funcionando con sus reglas de siempre.
          </Callout>
        ) : null}
      </div>
    </Panel>
  )
}
