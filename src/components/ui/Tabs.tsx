import { useRef, type ReactNode } from 'react'

import { cx } from '@/shared/cx'

/**
 * Pestanas dentro de una vista, navegables con el teclado.
 *
 * Implementa el patron `tablist` de ARIA: una sola parada de tabulacion para el
 * grupo y las flechas para moverse entre pestanas, que es como se comporta
 * cualquier control de pestanas nativo. Con botones sueltos, recorrer un
 * formulario largo obligaba a pasar por todas las pestanas una a una.
 */

export interface TabOption<T extends string> {
  readonly id: T
  readonly label: string
  /** Recuento o marca a la derecha de la etiqueta. */
  readonly badge?: ReactNode
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly TabOption<T>[]
  value: T
  onChange: (next: T) => void
  /** Nombre del grupo para quien navega sin ver la pantalla. */
  label: string
}) {
  const container = useRef<HTMLDivElement>(null)

  /** Las flechas mueven la seleccion y el foco a la vez, como el patron ARIA. */
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const offset =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0

    let index = options.findIndex((option) => option.id === value)
    if (offset !== 0) index = (index + offset + options.length) % options.length
    else if (event.key === 'Home') index = 0
    else if (event.key === 'End') index = options.length - 1
    else return

    event.preventDefault()
    const next = options[index]
    if (!next) return
    onChange(next.id)
    container.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus()
  }

  return (
    <div
      ref={container}
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="border-border-subtle flex shrink-0 gap-1 border-b"
    >
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            id={`tab-${option.id}`}
            data-tab-id={option.id}
            aria-selected={active}
            aria-controls={`panel-${option.id}`}
            // Una sola parada de tabulacion para todo el grupo.
            tabIndex={active ? 0 : -1}
            onClick={() => {
              onChange(option.id)
            }}
            className={cx(
              '-mb-px flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-accent text-accent'
                : 'text-ink-muted hover:text-ink hover:border-border-strong border-transparent',
            )}
          >
            {option.label}
            {option.badge}
          </button>
        )
      })}
    </div>
  )
}

/** Contenedor del contenido de una pestana, enlazado con su control. */
export function TabPanel({
  id,
  children,
  className,
}: {
  id: string
  children: ReactNode
  className?: string | undefined
}) {
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      // Alcanzable con el teclado: sin esto, el contenido de la pestana queda
      // fuera del recorrido si no tiene ningun control dentro.
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  )
}
