'use client'

import Image from 'next/image'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { Bike, ChevronLeft, Minus, Plus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { categoryById, type CategoryId } from './data'

export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span role="img" aria-label="LazyHand" className={cn('flex aspect-[924/410] items-center justify-center bg-white text-3xl font-black tracking-tight text-brand-deep', className)}>
        LazyHand
      </span>
    )
  }

  return (
    <Image
      src="/lazyhand-logo.png"
      alt="LazyHand logo"
      width={924}
      height={410}
      priority={priority}
      onError={() => setFailed(true)}
      className={cn('h-auto object-contain', className)}
    />
  )
}

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn('mx-auto flex min-h-svh w-full max-w-md flex-col bg-cream text-ink', className)}>
      {children}
    </main>
  )
}

export function LoadingScreen({ title = 'Getting your LazyHand ready', detail = 'Finding the right route for you…' }: { title?: string; detail?: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_38%,#FFF0E2_0%,#FAF7F2_52%,#F5EEE5_100%)] px-6 text-ink" role="status" aria-live="polite" aria-label={title}>
      <div className="w-full max-w-xs text-center">
        <div className="relative mx-auto grid size-32 place-items-center rounded-[2rem] bg-white shadow-[0_20px_60px_-28px_#C2410C66]">
          <span className="absolute inset-3 rounded-[1.5rem] border border-brand/10" />
          <span className="absolute size-[5.5rem] rounded-full border border-dashed border-brand/30 motion-safe:animate-[lh-orbit_8s_linear_infinite]" />
          <span className="absolute size-2 rounded-full bg-[#FCA5A5] shadow-[0_0_16px_#DC2626] motion-safe:animate-[lh-loading-pulse_1.4s_ease-in-out_infinite]" />
          <span className="relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand to-[#EF4444] text-white shadow-lg motion-safe:animate-[lh-loading-float_1.8s_ease-in-out_infinite]">
            <Bike className="size-7" strokeWidth={2.2} aria-hidden="true" />
          </span>
        </div>
        <h1 className="mt-7 text-lg font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-ink">{detail}</p>
        <div className="mx-auto mt-6 h-1.5 w-44 overflow-hidden rounded-full bg-[#E9DED2]" aria-hidden="true">
          <span className="block h-full w-2/5 rounded-full bg-gradient-to-r from-brand to-[#FCA5A5] motion-safe:animate-[lh-loading-progress_1.25s_ease-in-out_infinite]" />
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-deep">Local shops, closer</p>
      </div>
    </main>
  )
}

export function BackButton({ onClick, label = 'Go back', className }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn('grid size-9 shrink-0 place-items-center rounded-full border border-line bg-white text-ink transition active:scale-95', className)}
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
    </button>
  )
}

export function PrimaryButton({ className, children, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-[0_8px_20px_-12px_#C2410C] transition hover:bg-brand-deep active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#F6B98F] disabled:shadow-none',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ className, children, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...props}
      className={cn('flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:bg-[#FFF8F1] active:scale-[0.99]', className)}
    >
      {children}
    </button>
  )
}

type FieldProps = ComponentProps<'input'> & {
  label: string
  Icon: LucideIcon
  error?: string
  optional?: boolean
  prefix?: string
}

export function Field({ label, Icon, error, optional, prefix, id, className, ...props }: FieldProps) {
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-ink">
        {label}
        {optional ? <span className="font-normal"> · Optional</span> : <span className="ml-1 font-semibold text-brand-deep">· Required</span>}
      </label>
      <div
        className={cn(
          'flex h-12 items-center gap-2.5 rounded-xl border bg-white px-3.5 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15',
          error ? 'border-[#DC2626]' : 'border-line',
        )}
      >
        <Icon className="size-4 shrink-0 text-muted-ink" aria-hidden="true" />
        {prefix && <span className="text-sm text-ink">{prefix}</span>}
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          required={!optional}
          {...props}
          className={cn('h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-[#A3A7AD]', className)}
        />
      </div>
      {error && <p id={errorId} className="text-xs text-[#DC2626]">{error}</p>}
    </div>
  )
}

export function ProductTile({ category, size = 'md' }: { category: CategoryId; size?: 'sm' | 'md' | 'lg' }) {
  const { Icon, tone } = categoryById[category]
  const box = size === 'lg' ? 'size-20 rounded-2xl' : size === 'sm' ? 'size-12 rounded-xl' : 'size-14 rounded-xl'
  const icon = size === 'lg' ? 'size-8' : size === 'sm' ? 'size-5' : 'size-6'
  return (
    <span className={cn('grid shrink-0 place-items-center', box, tone)} aria-hidden="true">
      <Icon className={icon} strokeWidth={1.75} />
    </span>
  )
}

export function QtyControl({ qty, onAdd, onRemove, disabled, label }: { qty: number; onAdd: () => void; onRemove: () => void; disabled?: boolean; label: string }) {
  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        aria-label={`Add ${label}`}
        className="h-8 min-w-16 rounded-lg border border-brand bg-[#FFF5EC] px-3 text-xs font-bold text-brand-deep transition active:scale-95 disabled:cursor-not-allowed disabled:border-line disabled:bg-[#F4F1EC] disabled:text-muted-ink"
      >
        {disabled ? 'N/A' : 'ADD'}
      </button>
    )
  }
  return (
    <div className="flex h-8 min-w-16 items-center justify-between rounded-lg bg-brand text-white">
      <button type="button" onClick={onRemove} aria-label={`Remove one ${label}`} className="grid h-full w-7 place-items-center active:scale-90">
        <Minus className="size-3.5" aria-hidden="true" />
      </button>
      <span className="text-xs font-bold tabular-nums" aria-live="polite">{qty}</span>
      <button type="button" onClick={onAdd} aria-label={`Add one more ${label}`} className="grid h-full w-7 place-items-center active:scale-90">
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

export function StatusPill({ tone, children }: { tone: 'open' | 'closed' | 'info' | 'warn'; children: ReactNode }) {
  const tones = {
    open: 'bg-[#DCFCE7] text-[#15803D]',
    closed: 'bg-[#FEE2E2] text-[#B91C1C]',
    info: 'bg-[#FCE8E8] text-brand-deep',
    warn: 'bg-[#FEF3C7] text-[#92400E]',
  }
  return <span className={cn('inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', tones[tone])}>{children}</span>
}

export type NavItem<T extends string> = { key: T; label: string; Icon: LucideIcon; badge?: number }

export function BottomNav<T extends string>({ items, active, onSelect, wide = false }: { items: NavItem<T>[]; active: T; onSelect: (key: T) => void; wide?: boolean }) {
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[max(env(safe-area-inset-bottom),6px)] backdrop-blur">
      <ul className={cn('mx-auto flex w-full items-stretch justify-around px-2', wide ? 'max-w-5xl' : 'max-w-md')}>
        {items.map(({ key, label, Icon, badge }) => {
          const isActive = key === active
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(key)}
                aria-current={isActive ? 'page' : undefined}
                className={cn('relative flex min-h-12 w-full flex-col items-center justify-center gap-1 py-2 text-xs font-medium', isActive ? 'text-brand after:absolute after:top-0 after:h-0.5 after:w-8 after:rounded-full after:bg-brand' : 'text-muted-ink')}
              >
                <Icon className="size-5" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
                {label}
                {badge ? <span className="absolute right-[calc(50%-18px)] top-1.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">{badge}</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-[#16A34A]' : 'bg-[#D6D3CE]')}
    >
      <span className={cn('absolute top-1 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
    </button>
  )
}
