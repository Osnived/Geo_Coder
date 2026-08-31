import { cloneElement, isValidElement, useId } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

import { cx } from '@/shared/cx'

/** Primitivas visuales sin logica de negocio (spec seccion 19). */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:opacity-90',
  secondary: 'bg-surface text-ink border border-border-strong hover:bg-surface-muted',
  ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-danger-soft text-danger border border-danger/25 hover:bg-danger hover:text-white',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'secondary', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        BUTTON_STYLES[variant],
        className,
      )}
      {...props}
    />
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'border-border-subtle bg-surface text-ink placeholder:text-ink-muted w-full rounded-md border px-2.5 py-1.5 text-sm',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'border-border-subtle bg-surface text-ink w-full rounded-md border px-2 py-1.5 text-sm',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

/**
 * Etiqueta + control + ayuda.
 *
 * La etiqueta siempre esta escrita y visible: un `placeholder` desaparece al
 * escribir y no lo lee un lector de pantalla como nombre del campo.
 *
 * La asociacion es explicita, con `htmlFor` y un `id` generado, y no envolviendo
 * el control en la etiqueta. Envolver parece mas comodo pero convierte **todo**
 * el texto de dentro en el nombre del campo: la ayuda hacia que "Ciudad" se
 * llamara "Ciudad Fija un pais en la barra lateral", y el aviso de un
 * desplegable de sugerencias lo dejaba en "Ciudad Buscando sugerencias".
 *
 * El `id` se inyecta en el hijo si es un elemento y no trae uno propio. Cuando
 * el hijo no es el control en si —un contenedor con el campo y un sufijo, por
 * ejemplo— hay que pasar `htmlFor` y poner el `id` a mano en el control.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string
  hint?: string | undefined
  /** Mensaje de validacion. Sustituye a la ayuda mientras este presente. */
  error?: string | null | undefined
  /** Id del control, cuando el hijo no es el control directamente. */
  htmlFor?: string | undefined
  children: ReactNode
}) {
  const generatedId = useId()

  const child = isValidElement<{ id?: string }>(children) ? children : null
  const controlId = htmlFor ?? child?.props.id ?? generatedId

  // Solo se clona si hace falta: si el hijo ya trae id, se respeta.
  const control =
    htmlFor === undefined && child !== null && child.props.id === undefined
      ? cloneElement(child, { id: controlId })
      : children

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={controlId}
        className="text-ink-muted text-xs font-medium tracking-wide uppercase"
      >
        {label}
      </label>
      {control}
      {error ? (
        <span className="text-danger text-xs" role="alert">
          <span aria-hidden="true">✕ </span>
          {error}
        </span>
      ) : hint ? (
        <span className="text-ink-muted text-xs">{hint}</span>
      ) : null}
    </div>
  )
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger'

const BADGE_STYLES: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted',
  accent: 'bg-accent-soft text-accent',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: Tone
  children: ReactNode
  title?: string | undefined
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        BADGE_STYLES[tone],
      )}
    >
      {children}
    </span>
  )
}

export function Panel({
  title,
  description,
  actions,
  children,
  fill = false,
}: {
  title: string
  description?: string | undefined
  actions?: ReactNode
  children: ReactNode
  /**
   * Ocupa todo el alto disponible en lugar de crecer con su contenido. El
   * cuerpo se encarga entonces de su propio desplazamiento, de modo que la
   * pagina no crezca.
   */
  fill?: boolean
}) {
  return (
    <section
      className={cx(
        'border-border-subtle bg-surface rounded-lg border',
        fill && 'flex h-full min-h-0 flex-col',
      )}
    >
      <header className="border-border-subtle flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="text-ink-muted mt-0.5 text-xs">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cx('p-4', fill && 'flex min-h-0 flex-1 flex-col')}>{children}</div>
    </section>
  )
}

/**
 * Bloque con titulo dentro de un panel ya existente.
 *
 * Alternativa ligera a `Panel` para las vistas que ya viven dentro de una
 * tarjeta: anidar bordes y sombras convierte una pantalla de trabajo en un
 * acordeon de marcos.
 */
export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string | undefined
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? <p className="text-ink-muted mt-0.5 text-xs">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

type CalloutTone = 'danger' | 'warn' | 'accent' | 'ok'

const CALLOUT_STYLES: Record<CalloutTone, string> = {
  danger: 'bg-danger-soft text-danger border-danger/30',
  warn: 'bg-warn-soft text-warn border-warn/30',
  accent: 'bg-accent-soft text-accent border-accent/30',
  ok: 'bg-ok-soft text-ok border-ok/30',
}

/** Simbolo por tono: el aviso se entiende tambien en blanco y negro. */
const CALLOUT_ICONS: Record<CalloutTone, string> = {
  danger: '✕',
  warn: '⚠',
  accent: 'ℹ',
  ok: '✓',
}

export function Callout({ tone, children }: { tone: CalloutTone; children: ReactNode }) {
  return (
    <div
      className={cx('flex gap-2 rounded-md border px-3 py-2 text-sm', CALLOUT_STYLES[tone])}
      // Un error interrumpe; el resto se anuncia cuando toque.
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <span aria-hidden="true" className="shrink-0 leading-5">
        {CALLOUT_ICONS[tone]}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string | undefined }) {
  return (
    <div className="border-border-subtle text-ink-muted rounded-md border border-dashed px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="text-ink-muted mt-1 text-xs">{hint}</p> : null}
    </div>
  )
}
