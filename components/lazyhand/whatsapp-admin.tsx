'use client'

import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, MessageCircle, RefreshCw } from 'lucide-react'

type BridgeStatus = {
  connected: boolean
  status: string
  phone: string | null
  lastConnectedAt: string | null
  qr: string | null
}

const DEFAULT_PREVIEW_ADMIN = '9798077838'

export function WhatsAppAdmin() {
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [previewAvailable, setPreviewAvailable] = useState(false)
  const [previewPhone, setPreviewPhone] = useState(DEFAULT_PREVIEW_ADMIN)
  const [previewError, setPreviewError] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/whatsapp', { cache: 'no-store' })
      if (response.status === 401 || response.status === 403) {
        const preview = await fetch('/api/preview/session', { cache: 'no-store' })
        setPreviewAvailable(preview.ok)
        setNeedsAuth(true)
        return
      }
      setNeedsAuth(false)
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null
        setError(result?.error || 'WhatsApp status is unavailable.')
        return
      }
      setStatus(await response.json() as BridgeStatus)
      setError('')
    } catch {
      setError('Could not reach the WhatsApp bridge.')
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (needsAuth) return
    const timer = window.setInterval(() => { void load() }, status?.status === 'pairing' ? 2500 : 15000)
    return () => window.clearInterval(timer)
  }, [load, needsAuth, status?.status])

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setPreviewError('')
    try {
      const response = await fetch('/api/preview/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: previewPhone }),
      })
      const result = await response.json().catch(() => null) as { error?: string; admin?: boolean } | null
      if (!response.ok) throw new Error(result?.error || 'Preview sign-in failed.')
      if (!result?.admin) throw new Error('That number is not an active admin.')
      await load()
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : 'Preview sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const act = async (action: 'pair' | 'logout') => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(result?.error || 'The action could not be completed.')
      }
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  if (needsAuth) return (
    <main className="mx-auto grid min-h-svh max-w-lg content-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Admin access required</h1>
      <p className="text-sm text-muted-ink">The WhatsApp sender is managed by an administrator.</p>
      {previewAvailable ? (
        <form onSubmit={signIn} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
          <p className="text-sm font-semibold">Preview sign-in (no OTP)</p>
          <input value={previewPhone} onChange={event => setPreviewPhone(event.target.value)} inputMode="numeric" maxLength={10} className="h-11 rounded-xl border border-line px-3 text-sm" aria-label="Admin phone number" />
          {previewError && <p role="alert" className="text-xs text-red-700">{previewError}</p>}
          <button type="submit" disabled={busy} className="h-11 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Enter admin panel'}</button>
        </form>
      ) : <a href="/admin/categories" className="text-sm font-semibold text-brand-deep underline">Back to admin</a>}
    </main>
  )

  return (
    <main className="mx-auto min-h-svh max-w-2xl bg-cream px-4 py-8 text-ink">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-deep">LazyHand control center</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">WhatsApp sender</h1>
          <p className="mt-2 text-sm leading-6 text-muted-ink">Link the shop phone that sends order notifications. Scan once; the session is stored on the server and restored across restarts.</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/categories" className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold">Categories</a>
          <button type="button" onClick={() => void load()} className="grid size-10 place-items-center rounded-xl border border-line bg-white" aria-label="Refresh status"><RefreshCw className="size-4" /></button>
        </div>
      </header>

      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <section className="mt-6 rounded-2xl border border-line bg-white p-5">
        <div className="flex items-center gap-3">
          <span className={`grid size-11 place-items-center rounded-xl ${status?.connected ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-peach text-brand-deep'}`}><MessageCircle className="size-5" /></span>
          <div>
            <p className="font-semibold">{status?.connected ? 'Connected' : status?.status === 'pairing' ? 'Waiting for QR scan' : 'Not connected'}</p>
            <p className="text-xs text-muted-ink">{status?.phone ? `Sending as ${status.phone}` : 'No sender account linked yet'}</p>
          </div>
        </div>

        {status?.qr && (
          <div className="mt-5 flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={status.qr} alt="WhatsApp pairing QR code" className="size-64 rounded-xl border border-line bg-white p-2" />
            <p className="text-center text-xs text-muted-ink">WhatsApp → Linked devices → Link a device</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {!status?.connected && (
            <button type="button" disabled={busy} onClick={() => void act('pair')} className="h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : status?.status === 'pairing' ? 'Show a fresh QR' : 'Link WhatsApp'}
            </button>
          )}
          {status?.connected && (
            <button type="button" disabled={busy} onClick={() => void act('logout')} className="h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-50">Disconnect</button>
          )}
        </div>
        {status?.lastConnectedAt && <p className="mt-3 text-xs text-muted-ink">Last connected {new Date(status.lastConnectedAt).toLocaleString()}</p>}
      </section>

      <p className="mt-4 text-xs leading-5 text-muted-ink">This uses an unofficial WhatsApp Web session. Keep the linked phone online and do not log it out from WhatsApp, or the session is revoked and must be re-linked.</p>
    </main>
  )
}
