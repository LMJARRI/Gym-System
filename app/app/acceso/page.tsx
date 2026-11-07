import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { AccessScanner } from '@/components/access/access-scanner'

export const metadata: Metadata = { title: 'Control de acceso' }

export default async function AccessPage() {
  const { profile, gym } = await requireMember(['owner', 'staff', 'teacher'])
  return <AccessScanner timeZone={gym.timezone} isTeacher={profile.role === 'teacher'} />
}
