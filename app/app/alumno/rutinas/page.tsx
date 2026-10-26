import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { formatLocalDate } from '@/lib/format'
import { EmptyState, PageHeader } from '@/components/page-header'
import { StartWorkoutButton } from '@/components/student/start-workout-button'
import { KIND_LABEL, type ExerciseKind } from '@/components/routines/exercises-manager'

export const metadata: Metadata = { title: 'Mis rutinas' }

type Item = {
  position: number
  sets: number
  reps: string | null
  weight_kg: number | null
  rest_seconds: number | null
  duration_seconds: number | null
  distance_m: number | null
  notes: string | null
  exercises: { name: string; kind: ExerciseKind; instructions: string | null; media_url: string | null } | null
}

export default async function MyRoutinesPage() {
  const { supabase, profile } = await requireMember(['student'])
  const [{ data: routines }, { data: inProgress }] = await Promise.all([
    supabase
      .from('routines')
      .select('id, name, goal, description, starts_on, ends_on, version, routine_exercises(position, sets, reps, weight_kg, rest_seconds, duration_seconds, distance_m, notes, exercises(name, kind, instructions, media_url))')
      .eq('student_id', profile.id)
      .eq('status', 'active')
      .order('starts_on', { ascending: false }),
    supabase.from('workouts').select('id, routine_id').eq('student_id', profile.id).eq('status', 'in_progress').maybeSingle(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mis rutinas" description="Las rutinas que te asignó tu profesor. Empezá un entrenamiento para registrar series y pesos." />
      {!routines || routines.length === 0 ? (
        <EmptyState title="Todavía no tenés rutinas" detail="Cuando tu profesor te asigne una, la vas a ver acá y te llega un aviso." />
      ) : (
        routines.map((r) => {
          const items = ([...(r.routine_exercises ?? [])] as unknown as Item[]).sort((a, b) => a.position - b.position)
          return (
            <article key={r.id} aria-labelledby={`rt-${r.id}`} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
              <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1">
                  <h2 id={`rt-${r.id}`} className="text-xl font-bold">{r.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {r.goal ? `${r.goal} · ` : ''}desde {formatLocalDate(r.starts_on, { day: '2-digit', month: 'short' })}
                    {r.ends_on ? ` hasta ${formatLocalDate(r.ends_on, { day: '2-digit', month: 'short' })}` : ''}
                  </p>
                </div>
                <StartWorkoutButton routineId={r.id} resumeId={inProgress && inProgress.routine_id === r.id ? inProgress.id : undefined} blocked={!!inProgress && inProgress.routine_id !== r.id} />
              </header>
              {r.description && <p className="text-pretty text-sm leading-relaxed">{r.description}</p>}
              <ol className="flex flex-col divide-y rounded-xl border">
                {items.map((x) => (
                  <li key={x.position} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">
                        <span className="mr-2 font-mono text-xs text-muted-foreground">{x.position}</span>
                        {x.exercises?.name ?? 'Ejercicio'}
                      </span>
                      <span className="shrink-0 font-mono text-sm tabular-nums">
                        {x.sets} ×{' '}
                        {x.exercises?.kind === 'cardio'
                          ? [x.duration_seconds ? `${Math.round(x.duration_seconds / 60)} min` : null, x.distance_m ? `${Number(x.distance_m)} m` : null].filter(Boolean).join(' · ') || '—'
                          : `${x.reps ?? '—'}${x.weight_kg != null ? ` · ${Number(x.weight_kg)} kg` : ''}`}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {x.exercises ? KIND_LABEL[x.exercises.kind] : ''}
                      {x.rest_seconds ? ` · descanso ${x.rest_seconds}s` : ''}
                      {x.notes ? ` · ${x.notes}` : ''}
                    </span>
                    {x.exercises?.instructions && <p className="text-xs leading-relaxed text-muted-foreground">{x.exercises.instructions}</p>}
                    {x.exercises?.media_url && (
                      <a href={x.exercises.media_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary underline-offset-4 hover:underline">
                        Ver demostración
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </article>
          )
        })
      )}
    </div>
  )
}
