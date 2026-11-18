import 'server-only'

/**
 * CSRF guard for cookie-authenticated writes.
 *
 * Compares the browser's Origin header with the host the client actually used.
 * Next.js can populate `request.url` with an internal hostname (for example
 * `http://localhost:3000`) when the server sits behind a reverse proxy or a
 * cloudflared tunnel, so comparing against `request.url` rejects legitimate
 * same-origin requests. Derive the expected host from the standard Host /
 * X-Forwarded-Host headers instead, and only fall back to `request.url`.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false

  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return false
  }
  if (!originHost || originHost === 'null') return false

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase()
  const host = forwardedHost || request.headers.get('host')?.trim().toLowerCase() || ''
  if (host) return host === originHost

  try {
    return new URL(request.url).host.toLowerCase() === originHost
  } catch {
    return false
  }
}