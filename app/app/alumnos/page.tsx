import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { MEMBERSHIP_COLUMNS, type Membership } from '@/lib/domain'
import { todayIn } from '@/lib/format'
import { PageHeader } from '@/components/page-header'
import { StudentsList, type StudentRow } from '@/components/students/students-list'

export const metadata: Metadata = { title: 'Alumnos' }

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { supabase, gym, profile } = await requireMember(['owner', 'teacher'])
  const { filtro } = await searchParams

  const [students, memberships] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, member_number, email, phone, account_status, avatar_url')
      .eq('gym_id', gym.id)
      .eq('role', 'student')
      .order('full_name'),
    supabase.from('memberships').select(MEMBERSHIP_COLUMNS).eq('gym_id', gym.id),
  ])

  const byStudent = new Map((memberships.data ?? []).map((m) => [m.student_id, m as Membership]))
  const rows: StudentRow[] = (students.data ?? []).map((s) => ({ ...s, membership: byStudent.get(s.id) ?? null }))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={profile.role === 'owner' ? 'Alumnos' : 'Mis alumnos'}
        description={profile.role === 'owner' ? 'Buscá, filtrá y abrí la ficha de cada alumno.' : 'Alumnos asignados a vos.'}
      />
      <StudentsList
        rows={rows}
        today={todayIn(gym.timezone)}
        noticeDays={gym.expiry_notice_days}
        currency={gym.currency}
        isOwner={profile.role === 'owner'}
        initialFilter={filtro ?? 'todos'}
      />
    </div>
  )
}
