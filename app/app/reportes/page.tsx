import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, formatMoney, type PaymentMethod, type PaymentStatus } from '@/lib/domain'
import { resolveRange } from '@/lib/csv'
import { formatLocalDate, todayIn } from '@/lib/format'
import { attendanceByDay, attendanceByStudent, loadAttendance, loadNames, loadPayments, loadStudents, summarizePayments } from '@/lib/reports'
import { PageHeader, SectionTitle } from '@/components/page-header'
import { PrintButton } from '@/components/reports/print-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const metadata: Metadata = { title: 'Reportes' }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const { supabase, gym } = await requireMember(['owner'])
  const sp = await searchParams
  const { from, to } = resolveRange(sp.desde, sp.hasta, todayIn(gym.timezone))

  const [payments, attendance, students, names] = await Promise.all([
    loadPayments(supabase, gym.id, from, to),
    loadAttendance(supabase, gym.id, from, to),
    loadStudents(supabase, gym.id),
    loadNames(supabase, gym.id),
  ])

  const money = (n: number) => formatMoney(n, gym.currency)
  const pay = summarizePayments(payments)
  const perDay = attendanceByDay(attendance)
  const perStudent = attendanceByStudent(attendance).slice(0, 10)
  const newStudents = students.filter((s) => s.joined_at.slice(0, 10) >= from && s.joined_at.slice(0, 10) <= to).length
  const qs = `desde=${from}&hasta=${to}`
  const maxDay = Math.max(1, ...perDay.map((d) => d.count))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Reportes"
        description={`Del ${formatLocalDate(from, { day: 'numeric', month: 'long', year: 'numeric' })} al ${formatLocalDate(to, { day: 'numeric', month: 'long', year: 'numeric' })}. Los ingresos cuentan solo pagos aprobados.`}
        actions={<div className="print:hidden"><PrintButton /></div>}
      />

      <form method="get" className="flex flex-wrap items-end gap-3 print:hidden" aria-label="Filtrar por fechas">
        <div className="flex flex-col gap-2">
          <Label htmlFor="desde">Desde</Label>
          <Input id="desde" name="desde" type="date" defaultValue={from} className="h-10" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="hasta">Hasta</Label>
          <Input id="hasta" name="hasta" type="date" defaultValue={to} className="h-10" />
        </div>
        <Button type="submit">Aplicar</Button>
      </form>

      <section aria-label="Indicadores del período" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Ingresos confirmados', money(pay.income)],
          ['Pendientes de verificar', `${pay.byStatus.pending?.count ?? 0} · ${money(pay.byStatus.pending?.total ?? 0)}`],
          ['Días de asistencia', String(attendance.length)],
          ['Altas nuevas', String(newStudents)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
            <span className="font-mono text-xl font-bold tabular-nums">{value}</span>
          </div>
        ))}
      </section>

      <section aria-labelledby="pay-title" className="flex flex-col gap-3">
        <SectionTitle id="pay-title">Pagos por medio y estado</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Ingresos confirmados por medio</h3>
            {Object.keys(pay.incomeByMethod).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pagos aprobados en el período.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {Object.entries(pay.incomeByMethod).map(([m, total]) => (
                  <li key={m} className="flex justify-between"><span>{PAYMENT_METHOD_LABEL[m as PaymentMethod] ?? m}</span><span className="font-mono tabular-nums">{money(total)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Operaciones por estado</h3>
            {Object.keys(pay.byStatus).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin operaciones en el período.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {Object.entries(pay.byStatus).map(([s, v]) => (
                  <li key={s} className="flex justify-between"><span>{PAYMENT_STATUS_LABEL[s as PaymentStatus] ?? s}</span><span className="font-mono tabular-nums">{v.count} · {money(v.total)}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="att-title" className="flex flex-col gap-3">
        <SectionTitle id="att-title">Asistencia por día</SectionTitle>
        {perDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin asistencias en el período.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 rounded-2xl border bg-card p-4">
            {perDay.map((d) => (
              <li key={d.date} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 font-mono text-xs">{formatLocalDate(d.date, { day: '2-digit', month: 'short' })}</span>
                <span className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (d.count / maxDay) * 100)}%` }} aria-hidden="true" />
                <span className="font-mono tabular-nums">{d.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="top-title" className="flex flex-col gap-3">
        <SectionTitle id="top-title">Alumnos con más asistencias</SectionTitle>
        {perStudent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos en el período.</p>
        ) : (
          <ol className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {perStudent.map((s) => (
              <li key={s.student_id} className="flex justify-between px-4 py-2.5 text-sm"><span>{names.get(s.student_id) ?? 'Sin nombre'}</span><span className="font-mono tabular-nums">{s.days} días</span></li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="exp-title" className="flex flex-col gap-3 print:hidden">
        <SectionTitle id="exp-title">Exportar a CSV</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<a href={`/api/export/pagos?${qs}`} download />}>Pagos</Button>
          <Button variant="outline" nativeButton={false} render={<a href={`/api/export/asistencias?${qs}`} download />}>Asistencias</Button>
          <Button variant="outline" nativeButton={false} render={<a href="/api/export/alumnos" download />}>Alumnos y membresías</Button>
        </div>
        <p className="text-xs text-muted-foreground">Los archivos incluyen datos personales: guardalos con cuidado.</p>
      </section>
    </div>
  )
}
