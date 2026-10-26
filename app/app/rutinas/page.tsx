import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireMember } from '@/lib/session'
import { ROUTINE_STATUS_LABEL, type RoutineStatus } from '@/lib/domain'
import { formatLocalDate } from '@/lib/format'
import { EmptyState, PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Rutinas' }

export default async function RoutinesPage() {
  const { supabase, gym, profile } = await requireMember(['owner', 'teacher'])
  const { data } = await supabase
    .from('routines')
    .select('id, name, goal, status, version, starts_on, ends_on, updated_at, student:profiles!routines_student_id_fkey(full_name), teacher:profiles!routines_teacher_id_fkey(full_name)')
    .eq('gym_id', gym.id)
    .order('updated_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as Array<{
    id: string
    name: string
    goal: string | null
    status: RoutineStatus
    version: number
    starts_on: string
    ends_on: string | null
    student: { full_name: string } | null
    teacher: { full_name: string } | null
  }>

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rutinas"
        description={profile.role === 'owner' ? 'Todas las rutinas del gimnasio.' : 'Rutinas de tus alumnos asignados.'}
        actions={
          <Button nativeButton={false} render={<Link href="/app/rutinas/nueva" />}>
            <Plus aria-hidden="true" />
            Nueva rutina
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="Todavía no hay rutinas" detail="Creá una rutina y asignala a un alumno." />
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/app/rutinas/${r.id}`} className={cn('flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50', r.status === 'archived' && 'opacity-60')}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{r.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {r.student?.full_name ?? 'Alumno'}
                    {r.teacher ? ` · Prof. ${r.teacher.full_name}` : ''} · desde {formatLocalDate(r.starts_on, { day: '2-digit', month: 'short' })} · v{r.version}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{ROUTINE_STATUS_LABEL[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
