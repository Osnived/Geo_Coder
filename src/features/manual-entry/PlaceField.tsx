import { useState } from 'react'

import { Combobox, type ComboboxOption } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/primitives'
import type { Country } from '@/domain/models/country'
import type { PlaceKind, PlaceSuggestion } from '@/domain/services/placeProvider'
import { describeSuggestion, MIN_QUERY_LENGTH } from '@/domain/services/placeSuggestions'

import { usePlaceSuggestions } from './usePlaceSuggestions'

/**
 * Campo de ciudad o de region con sugerencias acotadas al pais.
 *
 * Las sugerencias se piden solo mientras el campo esta en uso. Importa por dos
 * razones: al elegir una ciudad se rellena su departamento, y si el campo de
 * departamento estuviera escuchando pediria sugerencias de un valor que se
 * acaba de poner solo, abriendo un desplegable que nadie pidio.
 */
export function PlaceField({
  label,
  kind,
  value,
  country,
  onChange,
  onSelect,
  hint,
}: {
  label: string
  kind: PlaceKind
  value: string
  /** Pais al que acotar. Sin el no se sugiere nada. */
  country: Country | null
  onChange: (next: string) => void
  /** Se elige una sugerencia de la lista. */
  onSelect: (suggestion: PlaceSuggestion) => void
  hint?: string | undefined
}) {
  const [active, setActive] = useState(false)
  /**
   * Ultimo valor elegido de la lista.
   *
   * Al elegir una sugerencia el valor del campo cambia, y eso disparaba una
   * consulta nueva preguntando por lo que se acaba de elegir: una peticion
   * tirada, y el desplegable reabriendose con la opcion ya escogida.
   */
  const [chosen, setChosen] = useState<string | null>(null)

  const { suggestions, isLoading, error } = usePlaceSuggestions({
    text: value,
    kind,
    country,
    enabled: active && country !== null && value !== chosen,
  })

  const options: ComboboxOption[] = suggestions.map((suggestion) => {
    const detail = describeSuggestion(suggestion)
    return detail === '' ? { value: suggestion.name } : { value: suggestion.name, detail }
  })

  const resolvedHint =
    country === null
      ? 'Fija un pais en la barra lateral para recibir sugerencias.'
      : (hint ?? undefined)

  return (
    // `onFocus` y `onBlur` de React suben desde el input, asi que el contenedor
    // sabe si el foco esta dentro. `relatedTarget` distingue salir del campo de
    // moverse dentro de el.
    <div
      onFocus={() => {
        setActive(true)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setActive(false)
      }}
    >
      <Field label={label} hint={resolvedHint}>
        <Combobox
          value={value}
          onChange={(next) => {
            // Volver a escribir invalida la eleccion anterior.
            setChosen(null)
            onChange(next)
          }}
          onSelect={(option) => {
            setChosen(option.value)
            // Se busca la sugerencia completa para poder arrastrar su region.
            const match = suggestions.find(
              (suggestion) =>
                suggestion.name === option.value &&
                describeSuggestion(suggestion) === (option.detail ?? ''),
            )
            if (match) onSelect(match)
            else onChange(option.value)
          }}
          options={options}
          isLoading={isLoading}
          error={error}
          emptyMessage={
            value.trim().length < MIN_QUERY_LENGTH
              ? `Escribe al menos ${String(MIN_QUERY_LENGTH)} letras.`
              : 'Sin sugerencias. Puedes escribirlo a mano.'
          }
        />
      </Field>
    </div>
  )
}
