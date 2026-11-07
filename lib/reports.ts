import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE = 1000
const MAX_ROWS = 20_000

/** Reads every page of a query (PostgREST caps responses, typically at 1000 rows). RLS still applies. */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export type PaymentRow = {
  id: string
  student_id: string
  amount: number
  method: string
  method_detail: string | null
  status: string
  declared_paid_on: string
  submitted_at: string
  verified_at: string | null
}

export type AttendanceRow = {
  student_id: string
  local_date: string
  first_access_at: string
  last_access_at: string
  access_count: number
}

export type StudentRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  member_number: number | null
  account_status: string
  joined_at: string
}

export type MembershipRow = { student_id: string; plan_name: string; status: string; starts_on: string; ends_on: string; balance_due: number | null }

export function loadPayments(supabase: SupabaseClient, gymId: string, from: string, to: string) {
  return fetchAll<PaymentRow>((a, b) =>
    supabase
      .from('payments')
      .select('id, student_id, amount, method, method_detail, status, declared_paid_on, submitted_at, verified_at')
      .eq('gym_id', gymId)
      .gte('declared_paid_on', from)
      .lte('declared_paid_on', to)
      .order('declared_paid_on')
      .order('id')
      .range(a, b),
  )
}

export function loadAttendance(supabase: SupabaseClient, gymId: string, from: string, to: string) {
  return fetchAll<AttendanceRow>((a, b) =>
    supabase
      .from('attendance_days')
      .select('student_id, local_date, first_access_at, last_access_at, access_count')
      .eq('gym_id', gymId)
      .is('voided_at', null)
      .gte('local_date', from)
      .lte('local_date', to)
      .order('local_date')
      .order('student_id')
      .range(a, b),
  )
}

export function loadStudents(supabase: SupabaseClient, gymId: string) {
  return fetchAll<StudentRow>((a, b) =>
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, member_number, account_status, joined_at')
      .eq('gym_id', gymId)
      .eq('role', 'student')
      .order('full_name')
      .order('id')
      .range(a, b),
  )
}

export function loadMemberships(supabase: SupabaseClient, gymId: string) {
  return fetchAll<MembershipRow>((a, b) =>
    supabase
      .from('memberships')
      .select('student_id, plan_name, status, starts_on, ends_on, balance_due')
      .eq('gym_id', gymId)
      .order('student_id')
      .range(a, b),
  )
}

export async function loadNames(supabase: SupabaseClient, gymId: string): Promise<Map<string, string>> {
  const rows = await fetchAll<{ id: string; full_name: string }>((a, b) =>
    supabase.from('profiles').select('id, full_name').eq('gym_id', gymId).order('id').range(a, b),
  )
  return new Map(rows.map((r) => [r.id, r.full_name || 'Sin nombre']))
}

/** Sums approved payments by method. Pending/rejected/void never count as income. */
export function summarizePayments(rows: PaymentRow[]) {
  const byStatus: Record<string, { count: number; total: number }> = {}
  const incomeByMethod: Record<string, number> = {}
  let income = 0
  for (const p of rows) {
    const s = (byStatus[p.status] ??= { count: 0, total: 0 })
    s.count += 1
    s.total += Number(p.amount)
    if (p.status === 'approved') {
      incomeByMethod[p.method] = (incomeByMethod[p.method] ?? 0) + Number(p.amount)
      income += Number(p.amount)
    }
  }
  return { byStatus, incomeByMethod, income }
}

export function attendanceByDay(rows: AttendanceRow[]) {
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.local_date, (map.get(r.local_date) ?? 0) + 1)
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))
}

export function attendanceByStudent(rows: AttendanceRow[]) {
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.student_id, (map.get(r.student_id) ?? 0) + 1)
  return [...map.entries()].map(([student_id, days]) => ({ student_id, days })).sort((a, b) => b.days - a.days)
}
