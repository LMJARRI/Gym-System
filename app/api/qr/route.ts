import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { QR_PREFIX, type QrIssue } from '@/lib/domain'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401, headers: NO_STORE })

  const { data, error } = await supabase.rpc('issue_qr_token')
  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'Solo los alumnos pueden generar un QR' }, { status: 403, headers: NO_STORE })
    }
    console.error('issue_qr_token failed', error.code, error.message)
    return NextResponse.json({ error: 'No se pudo generar el QR' }, { status: 500, headers: NO_STORE })
  }

  const body: QrIssue = {
    payload: `${QR_PREFIX}${data.token}`,
    expires_at: data.expires_at,
    server_now: data.server_now,
    ttl_seconds: data.ttl_seconds,
  }
  return NextResponse.json(body, { headers: NO_STORE })
}
