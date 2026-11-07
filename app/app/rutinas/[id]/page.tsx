import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/session'
import { ROUTINE_STATUS_LABEL, type RoutineStatus } from '@/lib/domain'
import { PageHeader } from '@/components/page-header'
import { RoutineEditor, type RoutineDraft } from '@/components/routines/routine-editor'
import { loadEditorData } from '@/components/routines/editor-data'

export const metadata: Metadata = { title: 'Editar rutina' }

export default async function EditRoutinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, gym, profile } = await requireMember(['owner', 'teacher'])

  const { data: routine } = await supabase
    .from('routines')
    .select('id, name, goal, description, student_id, teacher_id, starts_on, ends_on, status, version, routine_exercises(exercise_id, position, sets, reps, weight_kg, rest_seconds, duration_seconds, distance_m, notes)')
    .eq('id', id)
    .eq('gym_id', gym.id)
    .maybeSingle()
  if (!routine) notFound()

  const { students, exercises, teachers } = await loadEditorData(supabase, gym.id, profile.role === 'owner')
  const items = [...(routine.routine_exercises ?? [])].sort((a, b) => a.position - b.position)

  const initial: RoutineDraft = {
    id: routine.id,
    student_id: routine.student_id,
    teacher_id: routine.teacher_id ?? '',
    name: routine.name,
    goal: routine.goal ?? '',
    description: routine.description ?? '',
    starts_on: routine.starts_on,
    ends_on: routine.ends_on ?? '',
    status: routine.status as RoutineStatus,
    exercises: items.map((x) => ({
      key: crypto.randomUUID(),
      exercise_id: x.exercise_id,
      sets: x.sets,
      reps: x.reps ?? '',
      weight_kg: x.weight_kg == null ? '' : String(x.weight_kg),
      rest_seconds: x.rest_seconds == null ? '' : String(x.rest_seconds),
      duration_seconds: x.duration_seconds == null ? '' : String(x.duration_seconds),
      distance_m: x.distance_m == null ? '' : String(x.distance_m),
      notes: x.notes ?? '',
    })),
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={routine.name} description={`${ROUTINE_STATUS_LABEL[routine.status as RoutineStatus]} · versión ${routine.version}. Al guardar se crea una versión nueva y el alumno recibe un aviso.`} />
      <RoutineEditor students={students} exercises={exercises} teachers={teachers} isOwner={profile.role === 'owner'} initial={initial} />
    </div>
  )
}
