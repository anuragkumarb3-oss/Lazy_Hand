'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react'
import { rupee, type Order } from './data'

type UpqPayload = {
  status: string
  amount: number
  upiId?: string
  payeeName?: string
  reference: string
  uri?: string
  svg?: string
  error?: string
}

function useUpq(orderId: string) {
  const [payload, setPayload] = useState<UpqPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/upi`, { cache: 'no-store' })
        const json = await response.json().catch(() => null) as UpqPayload | null
        if (cancelled) return
        if (!response.ok) setError(json?.error || 'Could not load UPI details.')
        else { setPayload(json); setError('') }
      } catch {
        if (!cancelled) setError('Could not reach the payment service.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    // Poll so a verified payment shows up without a manual refresh.
    const timer = window.setInterval(() => { void load() }, 6000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [orderId])

  return { payload, error, loading }
}

function OrderQr({ order }: { order: Order }) {
  const { payload, error, loading } = useUpq(order.id)
  const paid = Boolean(payload?.status) && payload?.status !== 'pending'

  return (
    <section className="rounded-3xl border border-line bg-white p-4 shadow-[0_6px_22px_-18px_#6B4A34]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-ink">Order</p>
          <p className="font-mono text-sm font-semibold">{order.id}</p>
        </div>
        <p className="shrink-0 text-lg font-bold">{rupee(order.total)}</p>
      </div>

      {paid ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-[#DCFCE7] p-3 text-sm font-semibold text-[#15803D]">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" /> Payment verified
        </p>
      ) : loading && !payload ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-ink"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Generating QR…</p>
      ) : error ? (
        <p role="alert" className="mt-3 rounded-xl bg-[#FEF2F2] p-3 text-sm text-[#991B1B]">{error}</p>
      ) : payload?.svg ? (
        <div className="mt-3 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(payload.svg)}`}
            alt={`UPI QR code to pay ${rupee(order.total)} for order ${order.id}`}
            className="size-56 rounded-xl border border-line bg-white p-2"
          />
          <p className="text-center text-xs text-muted-ink">Scan with any UPI app · pay to <span className="font-semibold">{payload.upiId}</span></p>
          {payload.uri ? (
            <a href={payload.uri} className="text-xs font-semibold text-brand-deep underline">Open a UPI app on this device</a>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-ink">Waiting for a fresh QR…</p>
      )}
    </section>
  )
}

export function UpiPayPanel({ orders, onContinue }: { orders: Order[]; onContinue: () => void }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-3 px-4 py-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-deep">UPI payment</p>
      <h1 className="text-2xl font-bold tracking-tight">Scan to pay</h1>
      <p className="text-sm leading-6 text-muted-ink">
        Open any UPI app (Google Pay, PhonePe, Paytm, BHIM), scan the QR and pay the exact amount shown. The payee and amount are prefilled.
      </p>

      {orders.map(order => <OrderQr key={order.id} order={order} />)}

      <p className="flex items-start gap-2 rounded-xl bg-[#F0FDF4] p-3 text-xs leading-5 text-[#166534]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Your order is confirmed only after we verify the payment with our bank. A screenshot or returning to this page is never treated as proof of payment.
      </p>

      <button type="button" onClick={onContinue} className="mt-1 h-12 rounded-xl bg-brand text-sm font-semibold text-white">
        Continue to track order
      </button>
    </main>
  )
}