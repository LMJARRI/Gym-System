import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { requireMember } from '@/lib/session'
import { homePathForRole } from '@/lib/domain'

export default async function AppIndex() {
  await connection()
  const { profile } = await requireMember()
  redirect(homePathForRole(profile.role))
}
