import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MP_API, amountsMatch, isUuid, verifyMpSignature, type MpPayment } from '@/lib/mercadopago'

/**
 * Mercado Pago notifications. The notification body is NEVER trusted: we only take the payment id from it,
 * fetch the real payment from Mercado Pago with our access token, and cross-check reference, amount and currency
 * against our own database before crediting anything. Crediting is atomic and idempotent (system_apply_mp_payment).
 * 200 = handled/ignored (don't retry). 5xx = temporary problem (Mercado Pago retries).
 */
export async function POST(request: NextRequest) {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  const body = (await request.json().catch(() => null)) as { type?: string; topic?: string; data?: { id?: string | number } } | null
  const sp = request.nextUrl.searchParams
  const type = body?.type ?? body?.topic ?? sp.get('type') ?? sp.get('topic')
  const rawId = sp.get('data.id') ?? (body?.data?.id != null ? String(body.data.id) : null) ?? sp.get('id')

  const secret = process.env.MP_WEBHOOK_SECRET
  if (secret) {
    const ok = verifyMpSignature({
      secret,
      signatureHeader: request.headers.get('x-signature'),
      requestId: request.headers.get('x-request-id'),
      dataId: sp.get('data.id') ?? rawId,
    })
    if (!ok) return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  if (type !== 'payment' || !rawId || !/^\d{1,20}$/.test(rawId)) return NextResponse.json({ ok: true, ignored: true })

  const res = await fetch(`${MP_API}/v1/payments/${rawId}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (res.status === 404) return NextResponse.json({ ok: true, ignored: 'unknown_payment' })
  if (!res.ok) {
    console.error('[mp/webhook] fetch payment failed:', res.status)
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
  const mp = (await res.json()) as MpPayment
  if (!isUuid(mp.external_reference)) return NextResponse.json({ ok: true, ignored: 'no_reference' })

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('payments')
    .select('id, amount, gym_id, method')
    .eq('id', mp.external_reference)
    .maybeSingle<{ id: string; amount: number; gym_id: string; method: string }>()
  if (!row || row.method !== 'mercadopago') return NextResponse.json({ ok: true, ignored: 'unknown_reference' })

  const { data: gym } = await admin.from('gyms').select('currency').eq('id', row.gym_id).maybeSingle<{ currency: string }>()
  if (mp.status === 'approved' && (!amountsMatch(mp.transaction_amount, row.amount) || mp.currency_id !== gym?.currency)) {
    console.error('[mp/webhook] amount/currency mismatch for payment', row.id, mp.transaction_amount, mp.currency_id)
    return NextResponse.json({ ok: true, ignored: 'mismatch' })
  }

  const { data: outcome, error } = await admin.rpc('system_apply_mp_payment', {
    p_payment: row.id,
    p_mp_payment_id: String(mp.id),
    p_status: mp.status,
    p_amount: mp.transaction_amount,
  })
  if (error) {
    console.error('[mp/webhook] apply failed:', error.code, error.message)
    return NextResponse.json({ error: 'apply_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, outcome })
}

// Legacy IPN style notifications arrive as POST too; health checks may use GET.
export async function GET() {
  return NextResponse.json({ ok: true })
}
