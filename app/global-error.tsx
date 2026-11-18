'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          background: '#F7F8FA',
          color: '#202124',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <main style={{ maxWidth: 360 }}>
          <div
            style={{
              width: 48,
              height: 48,
              margin: '0 auto',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 16,
              background: '#fff0f0',
              color: '#D62828',
              fontWeight: 900,
              fontSize: 20,
            }}
          >
            !
          </div>
          <h1 style={{ marginTop: 16, fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, color: '#737373', fontSize: 14, lineHeight: 1.6 }}>
            A critical error occurred. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              height: 44,
              width: '100%',
              border: 0,
              borderRadius: 12,
              background: '#D62828',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}