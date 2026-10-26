import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/session'
import { PageHeader } from '@/components/page-header'
import { WorkoutTracker, type WorkoutSet } from '@/components/student/workout-tracker'

export const metadata: Metadata = { title: 'Entrenamiento' }

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, profile } = await requireMember(['student'])
  const { data: workout } = await supabase
    .from('workouts')
    .select('id, routine_name, routine_version, status, started_at, finished_at, notes, workout_sets(id, exercise_name, position, set_number, planned_reps, planned_weight_kg, reps, weight_kg, duration_seconds, distance_m, completed)')
    .eq('id', id)
    .eq('student_id', profile.id)
    .maybeSingle()
  if (!workout) notFound()

  const sets = ([...(workout.workout_sets ?? [])] as WorkoutSet[]).sort((a, b) => a.position - b.position || a.set_number - b.set_number)

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={workout.routine_name} description={workout.status === 'in_progress' ? 'Marcá cada serie al terminarla. Se guarda al instante.' : 'Entrenamiento finalizado.'} />
      <WorkoutTracker workoutId={workout.id} status={workout.status as 'in_progress' | 'completed' | 'abandoned'} initialSets={sets} />
    </div>
  )
}
