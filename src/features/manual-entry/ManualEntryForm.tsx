import { useMemo, useState, type FormEvent } from 'react'

import { useAppStore } from '@/app/store'
import { Button, Callout, Field, Section, TextInput } from '@/components/ui/primitives'
import { describeBatch } from '@/domain/models/batch'
import { emptyFields, FIELD_LABELS, NORMALIZED_FIELDS } from '@/domain/models/fields'
import type { NormalizedField, NormalizedFields } from '@/domain/models/fields'
import type { PlaceKind, PlaceSuggestion } from '@/domain/services/placeProvider'
import { regionOf } from '@/domain/services/placeSuggestions'
import { findCountryByName } from '@/shared/countries'

import { PlaceField } from './PlaceField'

/**
 * Campos que se rellenan con sugerencias del proveedor, y que indice consultan.
 *
 * La direccion no entra: sugerir direcciones es geocodificar, y para eso ya
 * esta el paso de Procesamiento, que ademas puntua el resultado. Y el codigo
 * postal tampoco: una ciudad tiene cientos y no hay ninguno que sugerir.
 */
const SUGGESTED_FIELDS: Partial<Record<NormalizedField, PlaceKind>> = {
  city: 'city',
  region: 'region',
}

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

  /**
   * Pais que acota las sugerencias: el escrito en el formulario si lo hay, y si
   * no el de la sesion. Es la misma regla que usa el constructor de consultas,
   * para que lo que se sugiere y lo que se busca no se contradigan.
   */
  const suggestionCountry = useMemo(() => {
    const typed = values.country.trim()
    if (typed === '') return country
    return findCountryByName(typed) ?? country
  }, [values.country, country])

  const setField = (field: NormalizedField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setFeedback(null)
  }

  /**
   * Al elegir una ciudad se rellena su departamento, que es lo que de verdad
   * ahorra trabajo: nadie se sabe de memoria a que departamento pertenece cada
   * municipio. No se pisa si ya habia algo escrito.
   */
  const applySuggestion = (field: NormalizedField, suggestion: PlaceSuggestion) => {
    setValues((current) => {
      const next = { ...current, [field]: suggestion.name }
      const region = regionOf(suggestion)
      if (region !== '' && current.region.trim() === '') next.region = region
      if (suggestion.countryName !== '' && current.country.trim() === '') {
        next.country = suggestion.countryName
      }
      return next
    })
    setFeedback(null)
  }

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
          {NORMALIZED_FIELDS.map((field) => {
            const kind = SUGGESTED_FIELDS[field]

            if (kind) {
              return (
                <PlaceField
                  key={field}
                  label={FIELD_LABELS[field]}
                  kind={kind}
                  value={values[field]}
                  country={suggestionCountry}
                  onChange={(next) => {
                    setField(field, next)
                  }}
                  onSelect={(suggestion) => {
                    applySuggestion(field, suggestion)
                  }}
                />
              )
            }

            return (
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
                    setField(field, event.target.value)
                  }}
                />
              </Field>
            )
          })}
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
