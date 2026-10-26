import type { Metadata } from 'next'
import Link from 'next/link'
import { requireMember } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { PageHeader, SectionTitle } from '@/components/page-header'
import { MeasurementsPanel, type Measurement } from '@/components/measurements-panel'

export const metadata: Metadata = { title: 'Mi progreso' }

const STATUS: Record<string, string> = { in_progress: 'En curso', completed: 'Completado', abandoned: 'Abandonado' }

export default async function ProgressPage() {
  const { supabase, gym, profile } = await requireMember(['student'])
  const [{ data: workouts }, { data: measurements }] = await Promise.all([
    supabase
      .from('workouts')
      .select('id, routine_name, status, started_at, finished_at, workout_sets(completed)')
      .eq('student_id', profile.id)
      .order('started_at', { ascending: false })
      .limit(30),
    supabase
      .from('body_measurements')
      .select('id, measured_on, weight_kg, height_cm, chest_cm, waist_cm, hip_cm, arm_cm, thigh_cm, notes')
      .eq('student_id', profile.id)
      .order('measured_on', { ascending: false })
      .limit(30),
  ])

  const completed = (workouts ?? []).filter((w) => w.status === 'completed').length

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader title="Mi progreso" description={`${completed} entrenamientos completados en los últimos registros.`} />

      <MeasurementsPanel studentId={profile.id} gymId={gym.id} rows={(measurements ?? []) as Measurement[]} canEdit />

      <section aria-labelledby="w-title" className="flex flex-col gap-3">
        <SectionTitle id="w-title">Entrenamientos</SectionTitle>
        {workouts && workouts.length > 0 ? (
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {workouts.map((w) => {
              const sets = (w.workout_sets ?? []) as { completed: boolean }[]
              const done = sets.filter((s) => s.completed).length
              return (
                <li key={w.id}>
                  <Link href={`/app/alumno/entrenar/${w.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">{w.routine_name}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(w.started_at, gym.timezone)} · {STATUS[w.status]}</span>
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums">{done}/{sets.length}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no registraste entrenamientos.</p>
        )}
      </section>
    </div>
  )
}
