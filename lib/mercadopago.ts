import { createHmac, timingSafeEqual } from 'node:crypto'

export const MP_API = 'https://api.mercadopago.com'

export type MpPayment = {
  id: number | string
  status: string
  external_reference: string | null
  transaction_amount: number
  currency_id: string
}

/** Amounts are compared in cents so 1500.1 and "1500.10" match. */
export function amountsMatch(a: number | string, b: number | string): boolean {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

/**
 * Verifies the `x-signature` header of a Mercado Pago webhook.
 * Template: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` signed with HMAC-SHA256 (hex) using the webhook secret.
 */
export function verifyMpSignature(opts: {
  secret: string
  signatureHeader: string | null
  requestId: string | null
  dataId: string | null
}): boolean {
  const { secret, signatureHeader, requestId, dataId } = opts
  if (!signatureHeader) return false
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    }),
  ) as Record<string, string>
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false

  let manifest = ''
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`

  const expected = createHmac('sha256', secret).update(manifest).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(v1)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Public site URL used for return URLs and the webhook. Mercado Pago cannot reach localhost. */
export function siteUrl(fallbackOrigin: string): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || fallbackOrigin).replace(/\/+$/, '')
}

export function isPublicUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !['localhost', '127.0.0.1', '0.0.0.0'].includes(u.hostname)
  } catch {
    return false
  }
}

export function buildPreference(input: {
  paymentId: string
  title: string
  amount: number
  currency: string
  gymName: string
  baseUrl: string
}) {
  const { paymentId, title, amount, currency, gymName, baseUrl } = input
  const pref: Record<string, unknown> = {
    items: [{ id: paymentId, title: title.slice(0, 120), quantity: 1, unit_price: Number(amount.toFixed(2)), currency_id: currency }],
    external_reference: paymentId,
    statement_descriptor: gymName.replace(/[^\w ]/g, '').slice(0, 22) || 'GYM',
    back_urls: {
      success: `${baseUrl}/app/alumno/pagos?mp=success`,
      pending: `${baseUrl}/app/alumno/pagos?mp=pending`,
      failure: `${baseUrl}/app/alumno/pagos?mp=failure`,
    },
  }
  // Only on a public HTTPS site: Mercado Pago rejects auto_return / notification_url pointing at localhost.
  if (isPublicUrl(baseUrl)) {
    pref.auto_return = 'approved'
    pref.notification_url = `${baseUrl}/api/mercadopago/webhook`
  }
  return pref
}
