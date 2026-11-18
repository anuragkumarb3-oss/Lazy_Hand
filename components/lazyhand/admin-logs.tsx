'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Empty, LiveDot, Pager, StatusPill, when } from './admin-ui'

type AuditLog = { id: number; actor_phone: string | null; action: string; target: string; detail: Record<string, unknown>; created_at: string }
type OrderLog = { id: number; orderId: string; actorName: string | null; actorRole: string; fromStatus: string | null; toStatus: string | null; note: string | null; createdAt: string; actorPhone: string | null }
type WhatsAppLog = { id: number; order_id: string | null; recipient: string; kind: string; body: string; status: string; provider: string | null; error: string | null; attempts: number; created_at: string; sent_at: string | null }
type LogsResponse = { type?: string; logs: (AuditLog | OrderLog | WhatsAppLog)[]; total: number; page: number; limit: number; counts?: Record<string, number>; generatedAt?: string }

const TABS = [
  { key: 'audit', label: 'Admin actions' },
  { key: 'orders', label: 'Order events' },
  { key: 'whatsapp', label: 'WhatsApp' },
]

async function fetcher(url: string): Promise<LogsResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Logs could not be loaded.')
  return response.json() as Promise<LogsResponse>
}

export function AdminLogs() {
  const [type, setType] = useState('audit')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<number | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const query = new URLSearchParams({ type, page: String(page), limit: '50' })
  if (debouncedQ) query.set('q', debouncedQ)
  if (type === 'whatsapp' && status) query.set('status', status)

  const { data, error, mutate, isValidating } = useSWR(`/api/admin/logs?${query.toString()}`, fetcher, { refreshInterval: 5000, keepPreviousData: true })

  const retry = async (id: number) => {
    setBusy(id)
    setNotice('')
    try {
      const response = await fetch('/api/admin/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry-whatsapp', id }),
      })
      const result = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(result?.error || 'Retry failed.')
      setNotice(`Message ${id} re-sent.`)
      await mutate()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Retry failed.')
    } finally {
      setBusy(null)
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Logs</h1>
          <p className="text-xs text-neutral-500">Every admin action, order transition and WhatsApp delivery attempt — append-only.</p>
        </div>
        <LiveDot loading={isValidating} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setType(tab.key); setPage(1); setStatus('') }}
              className={cn('rounded-md px-3 py-1.5 text-xs font-semibold', type === tab.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500')}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input value={q} onChange={event => setQ(event.target.value)} placeholder="Search action, phone, order, recipient…" className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm outline-none focus:border-neutral-900" />
        </div>
        {type === 'whatsapp' ? (
          <select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }} className="rounded-lg border border-neutral-300 px-2 py-2 text-sm">
            <option value="">All statuses</option>
            <option value="queued">Queued</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
          </select>
        ) : null}
      </div>

      {notice ? <p className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700">{notice}</p> : null}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p> : null}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {type === 'audit' ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">When</th>
                  <th className="px-4 py-2.5 font-semibold">Admin</th>
                  <th className="px-4 py-2.5 font-semibold">Action</th>
                  <th className="px-4 py-2.5 font-semibold">Target</th>
                  <th className="px-4 py-2.5 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(data?.logs as AuditLog[] | undefined)?.map(log => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-500">{when(log.created_at)}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-700">{log.actor_phone ? `+91 ${log.actor_phone}` : 'system'}</td>
                    <td className="px-4 py-2.5"><span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-neutral-800">{log.action}</span></td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-neutral-600">{log.target}</td>
                    <td className="px-4 py-2.5 text-[11px] text-neutral-500">{JSON.stringify(log.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {type === 'orders' ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">When</th>
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-4 py-2.5 font-semibold">Transition</th>
                  <th className="px-4 py-2.5 font-semibold">Actor</th>
                  <th className="px-4 py-2.5 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(data?.logs as OrderLog[] | undefined)?.map(log => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-500">{when(log.createdAt)}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] font-semibold text-neutral-800">{log.orderId}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-700">{log.fromStatus ? `${log.fromStatus} → ` : '→ '}{log.toStatus ?? 'event'}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-600">{log.actorName || log.actorPhone || log.actorRole}<span className="ml-1 text-[10px] uppercase text-neutral-400">{log.actorRole}</span></td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">{log.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {type === 'whatsapp' ? (
            <div>
              <div className="flex flex-wrap gap-2 border-b border-neutral-100 px-4 py-2 text-[11px] text-neutral-600">
                {['sent', 'queued', 'failed', 'skipped'].map(key => (
                  <span key={key} className="rounded-full bg-neutral-100 px-2 py-0.5">{key}: <b className="tabular-nums">{data?.counts?.[key] ?? 0}</b></span>
                ))}
              </div>
              <ul className="divide-y divide-neutral-100">
                {(data?.logs as WhatsAppLog[] | undefined)?.map(log => (
                  <li key={log.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={log.status} />
                      <span className="font-mono text-[11px] text-neutral-500">{log.recipient}</span>
                      <span className="text-xs font-semibold text-neutral-800">{log.kind}</span>
                      {log.order_id ? <span className="font-mono text-[11px] text-neutral-500">{log.order_id}</span> : null}
                      <span className="ml-auto text-[11px] text-neutral-400">{when(log.created_at)} · {log.attempts} attempt{log.attempts === 1 ? '' : 's'}</span>
                      {log.status !== 'sent' ? (
                        <button type="button" disabled={busy === log.id} onClick={() => retry(log.id)} className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-semibold text-neutral-700 disabled:opacity-50">
                          <RefreshCw className={cn('h-3 w-3', busy === log.id && 'animate-spin')} /> Retry
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-xs text-neutral-600">{log.body}</p>
                    {log.error ? <p className="mt-1 text-[11px] text-red-600">{log.error}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data && !data.logs.length ? <Empty>No log entries for this filter.</Empty> : null}
          {!data && !error ? <Empty>Loading logs…</Empty> : null}
        </div>
        {data ? <Pager page={data.page} pages={pages} total={data.total} onPage={setPage} /> : null}
      </div>
    </div>
  )
}
