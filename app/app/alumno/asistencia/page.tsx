import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { AttendanceHistory } from '@/components/student/attendance-history'

export const metadata: Metadata = { title: 'Mi asistencia' }

export default async function MyAttendancePage() {
  const { profile, gym } = await requireMember(['student'])
  return <AttendanceHistory studentId={profile.id} timeZone={gym.timezone} />
}
