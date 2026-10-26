import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS_PER_WINDOW = 5
const attemptsByIp = new Map<string, number[]>()

// Best-effort, per-instance limiter so the open sign-up endpoint can't be used to mass-create accounts.
function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (attemptsByIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  attemptsByIp.set(ip, recent)
  return recent.length > MAX_ATTEMPTS_PER_WINDOW
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; full_name?: unknown }
    | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim().slice(0, 120) : ''

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
  }
  if (password.length < 8 || password.length > 72) {
    return NextResponse.json({ error: 'weak_password' }, { status: 400 })
  }
  if (fullName.length < 2) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 })
  }

  const admin = createAdminClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (error) {
    if (error.code === 'email_exists' || error.code === 'user_already_exists') {
      return NextResponse.json({ error: 'cannot_create' }, { status: 400 })
    }
    if (error.code === 'weak_password') {
      return NextResponse.json({ error: 'weak_password' }, { status: 400 })
    }
    console.error('[sign-up] createUser failed:', error.code, error.message)
    return NextResponse.json({ error: 'unexpected' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
