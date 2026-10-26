import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AppRole, Gym, Profile } from '@/lib/domain'

export const getSession = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, gym_id, role, full_name, avatar_url, member_number')
    .eq('id', user.id)
    .maybeSingle<Profile>()

  let gym: Gym | null = null
  if (profile?.gym_id) {
    const { data } = await supabase
      .from('gyms')
      .select('id, name, timezone, join_code, qr_ttl_seconds, allow_pending_payment, pending_grace_days')
      .eq('id', profile.gym_id)
      .maybeSingle<Gym>()
    gym = data
  }

  return { supabase, user, profile, gym }
})

/** Requires a signed-in user who belongs to a gym, optionally with one of the given roles. */
export async function requireMember(roles?: AppRole[]) {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  const { profile, gym } = session
  if (!profile || !gym) redirect('/onboarding')
  if (roles && !roles.includes(profile.role)) redirect('/app')
  return { ...session, profile, gym }
}
