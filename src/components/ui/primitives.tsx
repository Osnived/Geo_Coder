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
        'border-border-subtle bg-surface text-ink placeholder:text-ink-faint w-full rounded-md border px-2.5 py-1.5 text-sm',
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

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | undefined
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-ink-muted text-xs font-medium tracking-wide uppercase">{label}</span>
      {children}
      {hint ? <span className="text-ink-faint text-xs">{hint}</span> : null}
    </label>
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
}: {
  title: string
  description?: string | undefined
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-border-subtle bg-surface rounded-lg border">
      <header className="border-border-subtle flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="text-ink-muted mt-0.5 text-xs">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Callout({
  tone,
  children,
}: {
  tone: 'danger' | 'warn' | 'accent'
  children: ReactNode
}) {
  const styles: Record<typeof tone, string> = {
    danger: 'bg-danger-soft text-danger border-danger/20',
    warn: 'bg-warn-soft text-warn border-warn/20',
    accent: 'bg-accent-soft text-accent border-accent/20',
  }
  return (
    <div className={cx('rounded-md border px-3 py-2 text-sm', styles[tone])} role="status">
      {children}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string | undefined }) {
  return (
    <div className="border-border-subtle text-ink-muted rounded-md border border-dashed px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="text-ink-faint mt-1 text-xs">{hint}</p> : null}
    </div>
  )
}
