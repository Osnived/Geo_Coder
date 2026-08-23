import { useState, type FormEvent } from 'react'

import { useAppStore } from '@/app/store'
import { Button, Callout, Field, Panel, TextInput } from '@/components/ui/primitives'
import { emptyFields, FIELD_LABELS, NORMALIZED_FIELDS } from '@/domain/models/fields'
import type { NormalizedFields } from '@/domain/models/fields'

/** Alta manual de registros. Produce el mismo modelo que la importacion. */
export function ManualEntryForm() {
  const addManualRecord = useAppStore((state) => state.addManualRecord)
  const country = useAppStore((state) => state.country)

  const [values, setValues] = useState<NormalizedFields>(emptyFields)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isEmpty = Object.values(values).every((value) => value.trim() === '')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (isEmpty) {
      setError('Escribe al menos un dato antes de agregar el registro.')
      return
    }
    setError(null)
    void addManualRecord(values).then(() => {
      setFeedback('Registro agregado.')
      // Se conservan cliente, tipo y pais: suelen repetirse en cargas seguidas.
      setValues((current) => ({
        ...emptyFields(),
        client: current.client,
        business_type: current.business_type,
        country: current.country,
      }))
    })
  }

  return (
    <Panel
      title="Nuevo registro manual"
      description="Todos los campos son opcionales, pero cuanto mas completes mejor sera la busqueda."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NORMALIZED_FIELDS.map((field) => (
            <Field
              key={field}
              label={FIELD_LABELS[field]}
              hint={
                field === 'country' && country && values.country.trim() === ''
                  ? `Si lo dejas vacio se usara ${country.name}`
                  : undefined
              }
            >
              <TextInput
                value={values[field]}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [field]: event.target.value }))
                  setFeedback(null)
                }}
              />
            </Field>
          ))}
        </div>

        {error ? <Callout tone="danger">{error}</Callout> : null}
        {feedback ? <Callout tone="accent">{feedback}</Callout> : null}

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={isEmpty}>
            Agregar registro
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setValues(emptyFields())
              setFeedback(null)
              setError(null)
            }}
          >
            Limpiar formulario
          </Button>
        </div>
      </form>
    </Panel>
  )
}
