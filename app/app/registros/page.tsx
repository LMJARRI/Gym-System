import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { RecordsBrowser } from '@/components/records/records-browser'

export const metadata: Metadata = { title: 'Registros de asistencia' }

export default async function RecordsPage() {
  const { gym, profile } = await requireMember(['owner', 'teacher'])
  return <RecordsBrowser gymId={gym.id} timeZone={gym.timezone} isOwner={profile.role === 'owner'} />
}
