import type { Metadata } from 'next'
import Link from 'next/link'
import { requireMember } from '@/lib/session'
import { formatMoney } from '@/lib/domain'
import { formatLocalDate } from '@/lib/format'
import { PageHeader, SectionTitle } from '@/components/page-header'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Resumen' }

type Dashboard = {
  today: string
  currency: string
  students_total: number
  students_inactive: number
  memberships_active: number
  memberships_expired: number
  memberships_pending: number
  expiring_soon: number
  receipts_pending: number
  income_month: number
  attendance_today: number
  routines_active: number
  new_students_month: number
}

function Metric({ label, value, href, tone }: { label: string; value: string | number; href?: string; tone?: 'alert' }) {
  const body = (
    <div className={cn('flex h-full flex-col gap-1 rounded-2xl border bg-card p-4', href && 'transition-colors hover:border-primary/60')}>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-2xl font-bold tabular-nums', tone === 'alert' && Number(value) > 0 && 'text-primary')}>{value}</span>
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

export default async function OwnerDashboardPage() {
  const { supabase, gym } = await requireMember(['owner'])
  const { data } = await supabase.rpc('owner_dashboard')
  const d = data as Dashboard | null

  const { data: expiring } = await supabase
    .from('memberships')
    .select('student_id, plan_name, ends_on, status, profiles!memberships_student_id_fkey(full_name)')
    .eq('gym_id', gym.id)
    .in('status', ['active', 'pending_payment'])
    .gte('ends_on', d?.today ?? '1970-01-01')
    .lte('ends_on', d ? addDays(d.today, gym.expiry_notice_days) : '1970-01-01')
    .order('ends_on')
    .limit(10)

  if (!d) return <p className="text-sm text-destructive">No se pudo cargar el resumen.</p>

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Resumen" description={`Hoy, ${formatLocalDate(d.today)}. Los ingresos solo cuentan pagos aprobados.`} />

      <section aria-label="Indicadores principales" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Ingresos del mes" value={formatMoney(Number(d.income_month), d.currency)} href="/app/pagos?estado=approved" />
        <Metric label="Comprobantes a revisar" value={d.receipts_pending} href="/app/pagos" tone="alert" />
        <Metric label="Asistencias hoy" value={d.attendance_today} href="/app/registros" />
        <Metric label="Por vencer" value={d.expiring_soon} href="/app/alumnos?filtro=por_vencer" tone="alert" />
      </section>

      <section aria-label="Alumnos y membresías" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Alumnos" value={d.students_total} href="/app/alumnos" />
        <Metric label="Membresías activas" value={d.memberships_active} href="/app/alumnos?filtro=activa" />
        <Metric label="Vencidas" value={d.memberships_expired} href="/app/alumnos?filtro=vencida" />
        <Metric label="Pago pendiente" value={d.memberships_pending} href="/app/alumnos?filtro=pendiente" />
        <Metric label="Nuevos este mes" value={d.new_students_month} />
        <Metric label="Cuentas inactivas" value={d.students_inactive} />
        <Metric label="Rutinas activas" value={d.routines_active} href="/app/rutinas" />
      </section>

      <section aria-labelledby="expiring-title" className="flex flex-col gap-3">
        <SectionTitle id="expiring-title">Vencen en los próximos {gym.expiry_notice_days} días</SectionTitle>
        {expiring && expiring.length > 0 ? (
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {expiring.map((m) => {
              const p = m.profiles as unknown as { full_name: string } | null
              return (
                <li key={m.student_id}>
                  <Link href={`/app/alumnos/${m.student_id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{p?.full_name || 'Sin nombre'}</span>
                      <span className="truncate text-xs text-muted-foreground">{m.plan_name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-sm">{formatLocalDate(m.ends_on, { day: '2-digit', month: 'short' })}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No hay membresías por vencer.</p>
        )}
      </section>
    </div>
  )
}

function addDays(date: string, days: number) {
  const [y, m, dd] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, dd + days))
  return t.toISOString().slice(0, 10)
}
