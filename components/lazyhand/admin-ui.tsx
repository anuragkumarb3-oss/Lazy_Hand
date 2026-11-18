'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function money(value: number | string | null | undefined) {
  const amount = Number(value ?? 0)
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: amount % 1 === 0 ? 0 : 2 })}`
}

export function when(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
}

export function timeOf(value: string | Date | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
}

export function ago(value: string | Date | null | undefined, now = Date.now()) {
  if (!value) return 'never'
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86_400)}d ago`
}

export const STATUS_LABEL: Record<string, string> = {
  placed: 'Placed',
  accepted: 'Accepted',
  ready: 'Ready',
  picked: 'Picked up',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  pending: 'Pending',
  approved: 'Approved',
  queued: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Skipped',
}

const STATUS_TONE: Record<string, string> = {
  placed: 'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-sky-50 text-sky-700 border-sky-200',
  ready: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  picked: 'bg-violet-50 text-violet-700 border-violet-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  queued: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  sent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  skipped: 'bg-neutral-100 text-neutral-500 border-neutral-200',
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', STATUS_TONE[status] ?? 'bg-neutral-100 text-neutral-600 border-neutral-200', className)}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'warn' | 'bad' | 'good'
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums',
        tone === 'warn' && 'text-amber-600',
        tone === 'bad' && 'text-red-600',
        tone === 'good' && 'text-emerald-600',
        tone === 'default' && 'text-neutral-900')}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  )
}

export function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-neutral-200 bg-white shadow-sm', className)}>
      <header className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-neutral-500">{children}</p>
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 px-4 py-3 text-xs text-neutral-500">
      <span>{total.toLocaleString('en-IN')} record{total === 1 ? '' : 's'} · page {page} of {pages}</span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 font-medium text-neutral-700 disabled:opacity-40">Previous</button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 font-medium text-neutral-700 disabled:opacity-40">Next</button>
      </div>
    </div>
  )
}

export function LiveDot({ loading }: { loading?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
      <span className={cn('h-2 w-2 rounded-full', loading ? 'animate-pulse bg-amber-400' : 'bg-emerald-500')} />
      {loading ? 'Updating' : 'Live'}
    </span>
  )
}
