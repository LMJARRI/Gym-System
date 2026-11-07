import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseQrPayload, type AccessResult } from '@/lib/domain'

const NO_STORE = { 'Cache-Control': 'no-store' }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401, headers: NO_STORE })

  let body: { code?: unknown; requestId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE })
  }

  const requestId = typeof body.requestId === 'string' ? body.requestId : ''
  if (!UUID_RE.test(requestId)) {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400, headers: NO_STORE })
  }
  const rawCode = typeof body.code === 'string' ? body.code.slice(0, 200) : ''
  // Unrecognized payloads still go to the database so the attempt is recorded as "invalid".
  const token = parseQrPayload(rawCode)

  const { data, error } = await supabase.rpc('validate_access_qr', { p_token: token, p_request_id: requestId })
  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'No tenés permiso para registrar ingresos' }, { status: 403, headers: NO_STORE })
    }
    console.error('validate_access_qr failed', error.code, error.message)
    return NextResponse.json({ error: 'No se pudo validar el código' }, { status: 500, headers: NO_STORE })
  }

  return NextResponse.json(data as AccessResult, { headers: NO_STORE })
}
