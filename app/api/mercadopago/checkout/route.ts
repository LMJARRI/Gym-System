import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MP_API, buildPreference, isUuid, siteUrl } from '@/lib/mercadopago'

const NO_STORE = { 'Cache-Control': 'no-store' }

const ERRORS: Record<string, [number, string]> = {
  forbidden: [403, 'Solo los alumnos pueden pagar su membresía.'],
  membership_not_found: [409, 'Primero elegí un plan.'],
  nothing_to_pay: [409, 'No tenés saldo pendiente.'],
}

/**
 * Student-only. The amount is read from the database (student_prepare_mp_payment), never from the browser.
 * Creates (or reuses) a Mercado Pago Checkout Pro preference and returns the URL to pay.
 */
export async function POST(request: NextRequest) {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'El pago con Mercado Pago no está configurado.' }, { status: 503, headers: NO_STORE })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401, headers: NO_STORE })

  const body = (await request.json().catch(() => null)) as { requestId?: unknown } | null
  if (!isUuid(body?.requestId)) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE })

  const { data, error } = await supabase.rpc('student_prepare_mp_payment', { p_request_id: body.requestId })
  if (error) {
    const key = Object.keys(ERRORS).find((k) => error.message?.includes(k))
    if (key) return NextResponse.json({ error: ERRORS[key][1] }, { status: ERRORS[key][0], headers: NO_STORE })
    console.error('[mp/checkout] prepare failed:', error.code, error.message)
    return NextResponse.json({ error: 'No se pudo iniciar el pago' }, { status: 500, headers: NO_STORE })
  }

  const prep = data as { payment_id: string; amount: number; currency: string; plan_name: string; init_point: string | null; gym_id: string }
  if (prep.init_point) return NextResponse.json({ url: prep.init_point }, { headers: NO_STORE })

  const { data: gym } = await supabase.from('gyms').select('name').eq('id', prep.gym_id).maybeSingle<{ name: string }>()
  const preference = buildPreference({
    paymentId: prep.payment_id,
    title: `Membresía ${prep.plan_name}`,
    amount: Number(prep.amount),
    currency: prep.currency,
    gymName: gym?.name ?? 'Gimnasio',
    baseUrl: siteUrl(request.nextUrl.origin),
  })

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': prep.payment_id },
    body: JSON.stringify(preference),
  })
  if (!res.ok) {
    console.error('[mp/checkout] preference failed:', res.status, (await res.text().catch(() => '')).slice(0, 300))
    return NextResponse.json({ error: 'Mercado Pago no pudo crear el pago. Intentá de nuevo.' }, { status: 502, headers: NO_STORE })
  }
  const pref = (await res.json()) as { id?: string; init_point?: string }
  if (!pref.init_point) return NextResponse.json({ error: 'Respuesta inválida de Mercado Pago' }, { status: 502, headers: NO_STORE })

  const { error: saveError } = await createAdminClient()
    .from('payments')
    .update({ mp_preference_id: pref.id ?? null, mp_init_point: pref.init_point })
    .eq('id', prep.payment_id)
    .eq('status', 'checkout')
  if (saveError) console.error('[mp/checkout] could not store preference:', saveError.message)

  return NextResponse.json({ url: pref.init_point }, { headers: NO_STORE })
}
