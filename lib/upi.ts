// UPI deep-link generation for direct (no-gateway) collections.
//
// This only builds the `upi://pay?...` URI and renders it as a QR. It does
// NOT verify payment. A generated QR proves nothing about whether money
// arrived; confirmation must come from a trusted source (bank statement,
// provider callback) recorded by an admin. Never mark an order paid because
// the customer returned to the app or uploaded a screenshot.

export type UpiConfig = {
  upiId: string
  payeeName: string
}

export function getUpiConfig(): UpiConfig | null {
  const upiId = process.env.UPI_ID?.trim() ?? ''
  if (!upiId) return null
  const payeeName = process.env.UPI_PAYEE_NAME?.trim() || 'LazyHand'
  return { upiId, payeeName }
}

export function upiConfigured(): boolean {
  return getUpiConfig() !== null
}

function formatAmount(amount: number): string {
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) return '0.00'
  return value.toFixed(2)
}

export type UpiLinkParams = {
  amount: number
  reference: string
  note?: string
}

// Build a UPI payment URI per the NPCI linking parameters:
// pa (payee address), pn (payee name), am (amount), cu (currency),
// tn (transaction note), tr (transaction reference).
export function buildUpiUri(params: UpiLinkParams, config: UpiConfig | null = getUpiConfig()): string | null {
  if (!config) return null
  const note = (params.note || `LazyHand order ${params.reference}`).slice(0, 50)
  const parts = [
    `pa=${encodeURIComponent(config.upiId)}`,
    `pn=${encodeURIComponent(config.payeeName)}`,
    `am=${encodeURIComponent(formatAmount(params.amount))}`,
    'cu=INR',
    `tn=${encodeURIComponent(note)}`,
    `tr=${encodeURIComponent(params.reference)}`,
  ]
  return `upi://pay?${parts.join('&')}`
}