'use client'

import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: error.message, stack: error.stack, digest: error.digest }),
      keepalive: true,
    }).catch(() => undefined)
  }, [error])

  return (
    <main className="grid min-h-svh place-items-center bg-cream px-6 text-center">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-white p-8 shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-peach text-xl font-black text-brand">!</span>
        <h1 className="mt-4 text-xl font-bold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-muted-ink">
          The page couldn&apos;t be loaded. Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white"
        >
          <RefreshCw className="size-4" aria-hidden="true" /> Try again
        </button>
        <a href="/" className="mt-3 inline-block text-sm font-semibold text-brand-deep">Back to home</a>
      </div>
    </main>
  )
}