import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { todayIn } from '@/lib/format'
import { PageHeader } from '@/components/page-header'
import { RoutineEditor } from '@/components/routines/routine-editor'
import { loadEditorData } from '@/components/routines/editor-data'

export const metadata: Metadata = { title: 'Nueva rutina' }

export default async function NewRoutinePage({ searchParams }: { searchParams: Promise<{ alumno?: string }> }) {
  const { supabase, gym, profile } = await requireMember(['owner', 'teacher'])
  const { alumno } = await searchParams
  const { students, exercises, teachers } = await loadEditorData(supabase, gym.id, profile.role === 'owner')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nueva rutina" />
      <RoutineEditor
        students={students}
        exercises={exercises}
        teachers={teachers}
        isOwner={profile.role === 'owner'}
        initial={{
          student_id: students.some((s) => s.id === alumno) ? alumno! : '',
          teacher_id: profile.role === 'teacher' ? profile.id : '',
          name: '',
          goal: '',
          description: '',
          starts_on: todayIn(gym.timezone),
          ends_on: '',
          status: 'active',
          exercises: [],
        }}
      />
    </div>
  )
}
