import { useState, type FormEvent } from 'react'

import { useAppStore } from '@/app/store'
import { Button, Callout, Field, Section, TextInput } from '@/components/ui/primitives'
import { describeBatch } from '@/domain/models/batch'
import { emptyFields, FIELD_LABELS, NORMALIZED_FIELDS } from '@/domain/models/fields'
import type { NormalizedFields } from '@/domain/models/fields'

/**
 * Alta manual de registros. Produce el mismo modelo que la importacion.
 *
 * Todos los registros que se escriban seguidos caen en el mismo grupo: una
 * sesion de entrada manual es un conjunto, no veinte conjuntos de uno. El grupo
 * se cierra a mano cuando se quiere empezar otra tanda.
 */
export function ManualEntryForm() {
  const addManualRecord = useAppStore((state) => state.addManualRecord)
  const closeManualGroup = useAppStore((state) => state.closeManualGroup)
  const country = useAppStore((state) => state.country)
  const activeManualBatchId = useAppStore((state) => state.activeManualBatchId)
  const batches = useAppStore((state) => state.batches)
  const records = useAppStore((state) => state.records)

  const activeGroup = batches.find((batch) => batch.id === activeManualBatchId) ?? null
  const inGroup =
    activeGroup === null ? 0 : records.filter((record) => record.batchId === activeGroup.id).length

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
      // El nombre del grupo se lee del store despues de agregar: si era el
      // primer registro, el grupo acaba de crearse.
      const group = useAppStore
        .getState()
        .batches.find((batch) => batch.id === useAppStore.getState().activeManualBatchId)
      setFeedback(
        group ? `Registro agregado al grupo ${describeBatch(group)}.` : 'Registro agregado.',
      )
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
    <Section
      title="Nuevo registro manual"
      description="Todos los campos son opcionales, pero cuanto mas completes mejor sera la busqueda."
      actions={
        activeGroup ? (
          <Button
            variant="ghost"
            onClick={() => {
              closeManualGroup()
              setFeedback('Grupo cerrado. El siguiente registro abrira uno nuevo.')
            }}
            title="Los registros siguientes formaran un grupo aparte"
          >
            Cerrar grupo
          </Button>
        ) : undefined
      }
    >
      {activeGroup ? (
        <p className="text-ink-muted text-xs">
          Grupo abierto: <span className="font-medium">{describeBatch(activeGroup)}</span> ·{' '}
          {inGroup} registro(s)
        </p>
      ) : (
        <p className="text-ink-muted text-xs">
          El primer registro abrira un grupo nuevo con la fecha y la hora de ahora.
        </p>
      )}

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
        {feedback ? <Callout tone="ok">{feedback}</Callout> : null}

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
    </Section>
  )
}
