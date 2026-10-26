import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import type { Membership } from '@/lib/domain'
import { StudentDashboard } from '@/components/student/student-dashboard'

export const metadata: Metadata = { title: 'Mi credencial' }

export default async function StudentPage() {
  const { supabase, profile, gym } = await requireMember(['student'])
  const { data: membership } = await supabase
    .from('memberships')
    .select('id, student_id, plan_name, status, starts_on, ends_on')
    .eq('student_id', profile.id)
    .maybeSingle<Membership>()

  return <StudentDashboard profile={profile} gym={{ name: gym.name, timezone: gym.timezone }} membership={membership} />
}
