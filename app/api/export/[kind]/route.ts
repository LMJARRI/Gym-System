import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveRange, toCsv } from '@/lib/csv'
import { todayIn } from '@/lib/format'
import { GYM_COLUMNS, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, MEMBERSHIP_LABEL, type Gym, type MembershipStatus, type PaymentMethod, type PaymentStatus } from '@/lib/domain'
import { loadAttendance, loadMemberships, loadNames, loadPayments, loadStudents } from '@/lib/reports'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** Owner-only CSV exports. The gym comes from the session profile; RLS applies to every query. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401, headers: NO_STORE })

  const { data: me } = await supabase.from('profiles').select('gym_id, role, account_status').eq('id', user.id).maybeSingle<{ gym_id: string | null; role: string; account_status: string }>()
  if (!me?.gym_id || me.role !== 'owner' || me.account_status !== 'active') {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403, headers: NO_STORE })
  }
  const { data: gym } = await supabase.from('gyms').select(GYM_COLUMNS).eq('id', me.gym_id).maybeSingle<Gym>()
  if (!gym) return NextResponse.json({ error: 'Gimnasio no encontrado' }, { status: 404, headers: NO_STORE })

  const sp = request.nextUrl.searchParams
  const { from, to } = resolveRange(sp.get('desde'), sp.get('hasta'), todayIn(gym.timezone))
  const names = await loadNames(supabase, gym.id)
  const who = (id: string) => names.get(id) ?? ''

  let csv: string
  try {
    if (kind === 'pagos') {
      const rows = await loadPayments(supabase, gym.id, from, to)
      csv = toCsv(
        ['Fecha de pago', 'Alumno', 'Importe', 'Moneda', 'Medio', 'Detalle', 'Estado', 'Presentado', 'Verificado'],
        rows.map((p) => [
          p.declared_paid_on,
          who(p.student_id),
          Number(p.amount),
          gym.currency,
          PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method,
          p.method_detail,
          PAYMENT_STATUS_LABEL[p.status as PaymentStatus] ?? p.status,
          p.submitted_at,
          p.verified_at,
        ]),
      )
    } else if (kind === 'asistencias') {
      const rows = await loadAttendance(supabase, gym.id, from, to)
      csv = toCsv(
        ['Fecha', 'Alumno', 'Primer ingreso', 'Último ingreso', 'Ingresos'],
        rows.map((a) => [a.local_date, who(a.student_id), a.first_access_at, a.last_access_at, a.access_count]),
      )
    } else if (kind === 'alumnos') {
      const [students, memberships] = await Promise.all([loadStudents(supabase, gym.id), loadMemberships(supabase, gym.id)])
      const byStudent = new Map(memberships.map((m) => [m.student_id, m]))
      csv = toCsv(
        ['N° socio', 'Nombre', 'Email', 'Teléfono', 'Cuenta', 'Alta', 'Plan', 'Membresía', 'Vence', 'Saldo pendiente'],
        students.map((s) => {
          const m = byStudent.get(s.id)
          return [
            s.member_number,
            s.full_name,
            s.email,
            s.phone,
            s.account_status === 'active' ? 'Activa' : 'Inactiva',
            s.joined_at?.slice(0, 10),
            m?.plan_name,
            m ? (MEMBERSHIP_LABEL[m.status as MembershipStatus] ?? m.status) : 'Sin membresía',
            m?.ends_on,
            m?.balance_due != null ? Number(m.balance_due) : '',
          ]
        }),
      )
    } else {
      return NextResponse.json({ error: 'Exportación desconocida' }, { status: 404, headers: NO_STORE })
    }
  } catch (error) {
    console.error('[export] failed:', kind, error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'No se pudo generar el archivo' }, { status: 500, headers: NO_STORE })
  }

  const filename = kind === 'alumnos' ? `alumnos-${todayIn(gym.timezone)}.csv` : `${kind}-${from}_${to}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...NO_STORE,
    },
  })
}
