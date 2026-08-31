import { useEffect, useState } from 'react'

import { useAppStore } from '@/app/store'
import { Button, Callout, Field } from '@/components/ui/primitives'
import {
  clampMaxRetries,
  clampSuccessPercentage,
  DEFAULT_RETRY_SETTINGS,
  MAX_ALLOWED_RETRIES,
  MAX_SUCCESS_PERCENTAGE,
  MIN_SUCCESS_PERCENTAGE,
} from '@/domain/services/retryPolicy'

/**
 * Porcentaje minimo de exito y numero maximo de reintentos.
 *
 * Se editan en un borrador local y se confirman con "Guardar": con guardado
 * inmediato, borrar un digito para escribir otro dejaba el valor en 4 durante
 * un instante, y eso es un ajuste que decide cuantas peticiones se hacen.
 */
export function GeocodingSettingsPanel() {
  const retry = useAppStore((state) => state.retry)
  const setRetrySettings = useAppStore((state) => state.setRetrySettings)

  const [percentage, setPercentage] = useState(String(retry.minimumSuccessPercentage))
  const [maxRetries, setMaxRetries] = useState(String(retry.maxRetries))
  const [saved, setSaved] = useState(false)

  // Si los ajustes cambian por fuera (hidratacion), el borrador los sigue.
  useEffect(() => {
    setPercentage(String(retry.minimumSuccessPercentage))
    setMaxRetries(String(retry.maxRetries))
  }, [retry.minimumSuccessPercentage, retry.maxRetries])

  const parsedPercentage = Number(percentage)
  const parsedRetries = Number(maxRetries)

  const percentageError =
    percentage.trim() === '' ||
    !Number.isFinite(parsedPercentage) ||
    parsedPercentage < MIN_SUCCESS_PERCENTAGE ||
    parsedPercentage > MAX_SUCCESS_PERCENTAGE
      ? `Escribe un numero entre ${String(MIN_SUCCESS_PERCENTAGE)} y ${String(MAX_SUCCESS_PERCENTAGE)}.`
      : null

  const retriesError =
    maxRetries.trim() === '' ||
    !Number.isFinite(parsedRetries) ||
    parsedRetries < 0 ||
    parsedRetries > MAX_ALLOWED_RETRIES
      ? `Escribe un numero entre 0 y ${String(MAX_ALLOWED_RETRIES)}.`
      : null

  const dirty =
    clampSuccessPercentage(parsedPercentage) !== retry.minimumSuccessPercentage ||
    clampMaxRetries(parsedRetries) !== retry.maxRetries

  const handleSave = () => {
    if (percentageError !== null || retriesError !== null) return
    setRetrySettings({
      minimumSuccessPercentage: parsedPercentage,
      maxRetries: parsedRetries,
    })
    setSaved(true)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-muted text-xs">
        Al terminar de procesar todos los registros se mide el porcentaje de exito. Si queda por
        debajo del minimo, se reintentan <strong>solo</strong> los que no obtuvieron resultado.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Porcentaje minimo de exito"
          hint={`Por defecto ${String(DEFAULT_RETRY_SETTINGS.minimumSuccessPercentage)}%. Rango ${String(MIN_SUCCESS_PERCENTAGE)}-${String(MAX_SUCCESS_PERCENTAGE)}.`}
          error={percentageError}
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={MIN_SUCCESS_PERCENTAGE}
              max={MAX_SUCCESS_PERCENTAGE}
              value={percentage}
              onChange={(event) => {
                setPercentage(event.target.value)
                setSaved(false)
              }}
              className="border-border-subtle bg-surface text-ink w-24 rounded-md border px-2.5 py-1.5 text-sm tabular-nums"
            />
            <span className="text-ink-muted text-sm" aria-hidden="true">
              %
            </span>
          </div>
        </Field>

        <Field
          label="Maximo de reintentos"
          hint={`Por defecto ${String(DEFAULT_RETRY_SETTINGS.maxRetries)}. Con 0 no se reintenta.`}
          error={retriesError}
        >
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_ALLOWED_RETRIES}
            value={maxRetries}
            onChange={(event) => {
              setMaxRetries(event.target.value)
              setSaved(false)
            }}
            className="border-border-subtle bg-surface text-ink w-24 rounded-md border px-2.5 py-1.5 text-sm tabular-nums"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={percentageError !== null || retriesError !== null || !dirty}
          onClick={handleSave}
        >
          Guardar configuracion
        </Button>
        {dirty ? null : (
          <span className="text-ink-muted text-xs">
            Activo: minimo {retry.minimumSuccessPercentage}% · hasta {retry.maxRetries} reintento(s)
          </span>
        )}
      </div>

      {saved && !dirty ? <Callout tone="ok">Configuracion guardada.</Callout> : null}
    </div>
  )
}
