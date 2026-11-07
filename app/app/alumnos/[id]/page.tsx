import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireMember } from '@/lib/session'
import { MEMBERSHIP_COLUMNS, PAYMENT_COLUMNS, ROUTINE_STATUS_LABEL, type Membership, type Payment, type Plan, type RoutineStatus } from '@/lib/domain'
import { formatLocalDate, todayIn } from '@/lib/format'
import { SectionTitle } from '@/components/page-header'
import { MemberOverview } from '@/components/students/member-overview'
import { MemberAttendance, type AttendanceRow, type OverrideRow } from '@/components/students/member-attendance'
import { MeasurementsPanel, type Measurement } from '@/components/measurements-panel'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Ficha del alumno' }

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, gym, profile: me } = await requireMember(['owner', 'teacher'])
  const isOwner = me.role === 'owner'

  const { data: student } = await supabase
    .from('profiles')
    .select('id, full_name, member_number, email, phone, birth_date, avatar_url, account_status, joined_at')
    .eq('id', id)
    .eq('gym_id', gym.id)
    .eq('role', 'student')
    .maybeSingle()
  if (!student) notFound()

  const [membership, plans, payments, attendance, overrides, routines, measurements] = await Promise.all([
    supabase.from('memberships').select(MEMBERSHIP_COLUMNS).eq('student_id', id).maybeSingle(),
    isOwner
      ? supabase.from('plans').select('id, name, description, price, duration_count, duration_unit, status, access_rules, notes').eq('gym_id', gym.id).eq('status', 'active').order('price')
      : Promise.resolve({ data: [] }),
    isOwner
      ? supabase.from('payments').select(PAYMENT_COLUMNS).eq('student_id', id).order('submitted_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
    supabase
      .from('attendance_days')
      .select('local_date, first_access_at, last_access_at, access_count, source, voided_at, void_reason')
      .eq('student_id', id)
      .order('local_date', { ascending: false })
      .limit(60),
    isOwner
      ? supabase.from('access_overrides').select('id, valid_from, valid_until, reason, revoked_at, created_at').eq('student_id', id).order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    supabase.from('routines').select('id, name, status, version, starts_on, ends_on').eq('student_id', id).order('created_at', { ascending: false }),
    supabase
      .from('body_measurements')
      .select('id, measured_on, weight_kg, height_cm, chest_cm, waist_cm, hip_cm, arm_cm, thigh_cm, notes')
      .eq('student_id', id)
      .order('measured_on', { ascending: false })
      .limit(30),
  ])

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/app/alumnos" />}>
          <ArrowLeft aria-hidden="true" />
          Alumnos
        </Button>
      </div>

      <MemberOverview
        student={student}
        membership={(membership.data as Membership | null) ?? null}
        plans={(plans.data ?? []) as Plan[]}
        payments={(payments.data ?? []) as Payment[]}
        gymId={gym.id}
        currency={gym.currency}
        timeZone={gym.timezone}
        renewalPolicy={gym.renewal_policy}
        today={todayIn(gym.timezone)}
        isOwner={isOwner}
      />

      <section aria-labelledby="routines-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle id="routines-title">Rutinas</SectionTitle>
          <Button size="sm" nativeButton={false} render={<Link href={`/app/rutinas/nueva?alumno=${student.id}`} />}>
            Nueva rutina
          </Button>
        </div>
        {routines.data && routines.data.length > 0 ? (
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {routines.data.map((r) => (
              <li key={r.id}>
                <Link href={`/app/rutinas/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Desde {formatLocalDate(r.starts_on, { day: '2-digit', month: 'short' })}
                      {r.ends_on ? ` hasta ${formatLocalDate(r.ends_on, { day: '2-digit', month: 'short' })}` : ''} · v{r.version}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{ROUTINE_STATUS_LABEL[r.status as RoutineStatus]}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sin rutinas asignadas.</p>
        )}
      </section>

      <MemberAttendance
        studentId={student.id}
        rows={(attendance.data ?? []) as AttendanceRow[]}
        overrides={(overrides.data ?? []) as OverrideRow[]}
        gymId={gym.id}
        timeZone={gym.timezone}
        today={todayIn(gym.timezone)}
        isOwner={isOwner}
      />

      <MeasurementsPanel studentId={student.id} gymId={gym.id} rows={(measurements.data ?? []) as Measurement[]} canEdit />
    </div>
  )
}
