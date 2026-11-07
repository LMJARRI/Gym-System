import { redirect } from 'next/navigation'
import { requireMember } from '@/lib/session'
import { homePathForRole } from '@/lib/domain'

export default async function AppIndex() {
  const { profile } = await requireMember()
  redirect(homePathForRole(profile.role))
}
