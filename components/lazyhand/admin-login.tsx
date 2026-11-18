'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LoaderCircle, ShieldCheck } from 'lucide-react'

export function AdminLogin() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/preview/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const result = await response.json().catch(() => null) as { admin?: boolean; error?: string } | null
      if (!response.ok) throw new Error(result?.error || 'Sign-in is not available on this deployment.')
      if (!result?.admin) throw new Error('This number is not on the admin allow-list.')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-neutral-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-600 text-white"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <h1 className="text-base font-bold text-neutral-900">LazyHand admin</h1>
            <p className="text-xs text-neutral-500">Sign in to manage the platform.</p>
          </div>
        </div>
        <label className="text-xs font-semibold text-neutral-700" htmlFor="admin-phone">Admin mobile number</label>
        <input
          id="admin-phone"
          value={phone}
          onChange={event => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
          inputMode="numeric"
          autoComplete="tel"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
          placeholder="10-digit mobile number"
        />
        {error ? <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || phone.length !== 10}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {busy ? 'Signing in…' : 'Open admin console'}
        </button>
        <p className="mt-4 text-[11px] leading-relaxed text-neutral-500">
          Only numbers listed in the admin allow-list can open this console. Every action is recorded in the audit log.
        </p>
      </form>
    </div>
  )
}
