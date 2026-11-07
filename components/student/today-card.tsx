import { CheckCircle2, CircleDashed } from 'lucide-react'
import type { AttendanceToday } from '@/lib/domain'
import { formatLocalDate, formatTime } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function TodayCard({ data, isLoading, hasError }: { data?: AttendanceToday; isLoading: boolean; hasError: boolean }) {
  if (isLoading && !data) return <Skeleton className="h-28 w-full rounded-2xl" />

  if (!data) {
    return (
      <section className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
        {hasError ? 'No pudimos cargar tu asistencia. Reintentando…' : 'Sin datos de asistencia.'}
      </section>
    )
  }

  const present = data.present
  return (
    <section
      aria-live="polite"
      aria-labelledby="today-title"
      className={cn(
        'flex items-center gap-4 rounded-2xl border p-5 transition-colors',
        present ? 'border-success/40 bg-success/10' : 'bg-card',
      )}
    >
      <span
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full',
          present ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {present ? <CheckCircle2 className="size-6" aria-hidden="true" /> : <CircleDashed className="size-6" aria-hidden="true" />}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground capitalize">
          {formatLocalDate(data.local_date)}
        </span>
        <h2 id="today-title" className="text-xl font-extrabold tracking-tight">
          {present ? 'Presente hoy' : 'Todavía no registraste tu ingreso hoy'}
        </h2>
        {present && data.first_access_at ? (
          <p className="text-sm text-muted-foreground">
            Ingreso {formatTime(data.first_access_at, data.timezone)}
            {data.access_count > 1 && data.last_access_at
              ? ` · último ${formatTime(data.last_access_at, data.timezone)} · ${data.access_count} ingresos`
              : null}
          </p>
        ) : null}
      </div>
    </section>
  )
}
