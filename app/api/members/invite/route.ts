import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const NO_STORE = { 'Cache-Control': 'no-store' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVITABLE_ROLES = ['student', 'teacher', 'staff'] as const

/**
 * Owner-only. Creates (or re-links) an account, attaches it to the OWNER'S gym and returns a one-time
 * invitation link. No email is sent from here: the owner shares the link. The gym id is never taken from the body.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401, headers: NO_STORE })

  const { data: me } = await supabase
    .from('profiles')
    .select('gym_id, role, account_status')
    .eq('id', user.id)
    .maybeSingle<{ gym_id: string | null; role: string; account_status: string }>()
  if (!me?.gym_id || me.role !== 'owner' || me.account_status !== 'active') {
    return NextResponse.json({ error: 'No tenés permiso para invitar personas' }, { status: 403, headers: NO_STORE })
  }

  const body = (await request.json().catch(() => null)) as { email?: unknown; full_name?: unknown; role?: unknown } | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim().slice(0, 120) : ''
  const role = INVITABLE_ROLES.find((r) => r === body?.role)

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400, headers: NO_STORE })
  }
  if (fullName.length < 2) return NextResponse.json({ error: 'Ingresá el nombre' }, { status: 400, headers: NO_STORE })
  if (!role) return NextResponse.json({ error: 'Rol inválido' }, { status: 400, headers: NO_STORE })

  const admin = createAdminClient()
  const origin = request.nextUrl.origin

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { full_name: fullName } },
  })
  if (linkError || !link?.user || !link.properties?.hashed_token) {
    if (linkError?.code === 'email_exists' || linkError?.code === 'user_already_exists') {
      return NextResponse.json({ error: 'Ese email ya tiene una cuenta. Pedile que se una con el código del gimnasio.' }, { status: 409, headers: NO_STORE })
    }
    console.error('[invite] generateLink failed:', linkError?.code, linkError?.message)
    return NextResponse.json({ error: 'No se pudo crear la invitación' }, { status: 500, headers: NO_STORE })
  }

  const { error: attachError } = await admin.rpc('admin_attach_member', { p_user: link.user.id, p_gym: me.gym_id, p_role: role })
  if (attachError) {
    // Don't leave an orphan account behind if it could not be attached to the gym.
    await admin.auth.admin.deleteUser(link.user.id)
    console.error('[invite] admin_attach_member failed:', attachError.code, attachError.message)
    return NextResponse.json({ error: 'No se pudo asociar la cuenta al gimnasio' }, { status: 500, headers: NO_STORE })
  }

  const params = new URLSearchParams({ token_hash: link.properties.hashed_token, type: 'invite', next: '/auth/reset-password' })
  return NextResponse.json({ ok: true, link: `${origin}/auth/confirm?${params}` }, { headers: NO_STORE })
}
