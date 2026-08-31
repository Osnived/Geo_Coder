import { useEffect, useId, useRef, useState } from 'react'

import { cx } from '@/shared/cx'

/**
 * Campo de texto con sugerencias, navegable con el teclado.
 *
 * Sigue el patron `combobox` de ARIA en su forma editable: el campo sigue
 * siendo un campo de texto normal y las sugerencias son una ayuda, no una
 * restriccion. Es deliberado: OpenStreetMap no conoce todos los municipios del
 * mundo, y un desplegable cerrado impediria escribir el que falte.
 *
 * Teclado:
 *   ↓ / ↑     recorrer las sugerencias
 *   Enter     aceptar la resaltada
 *   Esc       cerrar sin cambiar nada
 *   Tab       salir; cierra la lista
 */

export interface ComboboxOption {
  /** Valor que se escribe en el campo al elegirla. */
  readonly value: string
  /** Segunda linea, para desambiguar homonimos. */
  readonly detail?: string
}

export function Combobox({
  value,
  onChange,
  onSelect,
  options,
  isLoading = false,
  error = null,
  emptyMessage,
  id,
  'aria-describedby': describedBy,
}: {
  value: string
  onChange: (next: string) => void
  /** Se elige una sugerencia. Llega el valor y la opcion completa. */
  onSelect: (option: ComboboxOption) => void
  options: readonly ComboboxOption[]
  isLoading?: boolean
  /** Mensaje si la consulta fallo. No bloquea escribir. */
  error?: string | null
  /** Que decir cuando no hay resultados. Si falta, no se dice nada. */
  emptyMessage?: string | undefined
  id?: string | undefined
  'aria-describedby'?: string | undefined
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listId = `${inputId}-listbox`
  const statusId = `${inputId}-status`

  const [isOpen, setIsOpen] = useState(false)
  /** Indice resaltado, o -1 si no hay ninguno. */
  const [active, setActive] = useState(-1)
  const container = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const hasOptions = options.length > 0
  const showEmpty = isOpen && !isLoading && !hasOptions && emptyMessage !== undefined

  /** Al cambiar las opciones, el resaltado anterior ya no significa nada. */
  useEffect(() => {
    setActive(-1)
  }, [options])

  /** Un clic fuera cierra la lista: es lo que espera cualquiera. */
  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [isOpen])

  /** Mantiene la opcion resaltada a la vista al recorrer con las flechas. */
  useEffect(() => {
    if (active < 0) return
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (index: number) => {
    const option = options[index]
    if (!option) return
    onSelect(option)
    setIsOpen(false)
    setActive(-1)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // Solo cierra: lo escrito se queda, que es lo que se espera de Esc aqui.
      if (isOpen) event.preventDefault()
      setIsOpen(false)
      setActive(-1)
      return
    }

    if (event.key === 'Tab') {
      setIsOpen(false)
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        return
      }
      if (!hasOptions) return

      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => {
        // Sin nada resaltado, abajo entra por el principio y arriba por el
        // final. La aritmetica de la vuelta no vale aqui: con `current` en -1
        // dejaria la flecha arriba en el segundo elemento.
        if (current < 0) return step === 1 ? 0 : options.length - 1
        // Da la vuelta por los dos extremos: recorrer ocho opciones y quedarse
        // clavado en la ultima es una molestia gratuita.
        return (current + step + options.length) % options.length
      })
      return
    }

    if (event.key === 'Enter' && isOpen && active >= 0) {
      // Solo se intercepta si hay algo resaltado: si no, Enter debe poder
      // enviar el formulario como siempre.
      event.preventDefault()
      choose(active)
    }
  }

  return (
    <div ref={container} className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${String(active)}` : undefined}
        aria-describedby={[describedBy, statusId].filter(Boolean).join(' ') || undefined}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(true)
        }}
        onFocus={() => {
          if (hasOptions) setIsOpen(true)
        }}
        onKeyDown={handleKeyDown}
        className="border-border-subtle bg-surface text-ink w-full rounded-md border px-2.5 py-1.5 text-sm"
      />

      {/*
        Lo que se anuncia a un lector de pantalla: cuantas sugerencias hay, no
        cada pulsacion. `polite` para no interrumpir a quien esta escribiendo.
      */}
      <span id={statusId} role="status" aria-live="polite" className="sr-only">
        {isLoading
          ? 'Buscando sugerencias'
          : hasOptions
            ? `${String(options.length)} sugerencia(s) disponibles. Usa las flechas para recorrerlas.`
            : ''}
      </span>

      {isLoading ? (
        <span
          aria-hidden="true"
          className="text-ink-muted pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs"
        >
          ···
        </span>
      ) : null}

      {isOpen && (hasOptions || showEmpty) ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          className="border-border-strong bg-surface absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border py-1 shadow-lg"
        >
          {hasOptions ? (
            options.map((option, index) => (
              <li
                key={`${option.value}-${option.detail ?? ''}`}
                id={`${listId}-${String(index)}`}
                role="option"
                aria-selected={index === active}
                // `onMouseDown` y no `onClick`: el clic llegaria despues de que
                // el campo pierda el foco y la lista ya estaria cerrada.
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(index)
                }}
                onMouseEnter={() => {
                  setActive(index)
                }}
                className={cx(
                  'cursor-pointer px-2.5 py-1.5 text-sm',
                  index === active ? 'bg-accent-soft text-accent' : 'hover:bg-surface-sunken',
                )}
              >
                <span className="block truncate">{option.value}</span>
                {option.detail ? (
                  <span className="text-ink-muted block truncate text-xs">{option.detail}</span>
                ) : null}
              </li>
            ))
          ) : (
            <li className="text-ink-muted px-2.5 py-1.5 text-xs">{emptyMessage}</li>
          )}
        </ul>
      ) : null}

      {error ? (
        <p className="text-warn mt-1 text-xs" role="status">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
    </div>
  )
}
