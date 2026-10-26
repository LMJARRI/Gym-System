export type AppRole = 'owner' | 'staff' | 'teacher' | 'student'
export type MembershipStatus = 'active' | 'pending_payment' | 'suspended' | 'expired'

export type Profile = {
  id: string
  gym_id: string | null
  role: AppRole
  full_name: string
  avatar_url: string | null
  member_number: number | null
}

export type Gym = {
  id: string
  name: string
  timezone: string
  join_code: string
  qr_ttl_seconds: number
  allow_pending_payment: boolean
  pending_grace_days: number
}

export type Membership = {
  id: string
  student_id: string
  plan_name: string
  status: MembershipStatus
  starts_on: string
  ends_on: string
}

export type AccessReason =
  | 'ok'
  | 'invalid'
  | 'used'
  | 'revoked'
  | 'expired'
  | 'out_of_scope'
  | 'no_membership'
  | 'membership_not_started'
  | 'membership_expired'
  | 'membership_suspended'
  | 'membership_pending'

export type AccessResult = {
  event_id: string
  result: 'granted' | 'denied'
  reason: AccessReason
  occurred_at: string
  local_date: string
  replayed: boolean
  student: {
    full_name: string
    avatar_url: string | null
    member_number: number | null
    membership_status: MembershipStatus | null
    membership_plan: string | null
    membership_ends_on: string | null
  } | null
}

export type AttendanceToday = {
  local_date: string
  timezone: string
  present: boolean
  first_access_at: string | null
  last_access_at: string | null
  access_count: number
}

export type QrIssue = {
  payload: string
  expires_at: string
  server_now: string
  ttl_seconds: number
}

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'Dueño',
  staff: 'Recepción',
  teacher: 'Profesor',
  student: 'Alumno',
}

export const MEMBERSHIP_LABEL: Record<MembershipStatus, string> = {
  active: 'Activa',
  pending_payment: 'Pago pendiente',
  suspended: 'Suspendida',
  expired: 'Vencida',
}

export const REASON_COPY: Record<AccessReason, { title: string; detail: string }> = {
  ok: { title: 'Ingreso registrado', detail: 'Asistencia de hoy actualizada.' },
  invalid: { title: 'Código inválido', detail: 'El QR no pertenece a este gimnasio o no es una credencial válida.' },
  used: { title: 'Código ya utilizado', detail: 'Este QR ya se usó. El alumno debe generar uno nuevo.' },
  revoked: { title: 'Código reemplazado', detail: 'El alumno generó un QR más nuevo. Pedile que muestre el actual.' },
  expired: { title: 'Código vencido', detail: 'El QR expiró. El alumno debe generar uno nuevo.' },
  out_of_scope: { title: 'Fuera de tu grupo', detail: 'Este alumno no está asignado a tus clases.' },
  no_membership: { title: 'Sin membresía', detail: 'El alumno no tiene una membresía cargada.' },
  membership_not_started: { title: 'Membresía no vigente', detail: 'La membresía todavía no comenzó.' },
  membership_expired: { title: 'Membresía vencida', detail: 'La membresía del alumno está vencida.' },
  membership_suspended: { title: 'Membresía suspendida', detail: 'La membresía del alumno está suspendida.' },
  membership_pending: { title: 'Pago pendiente', detail: 'La membresía tiene un pago pendiente.' },
}

export const QR_PREFIX = 'GYMQR1:'
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/

/** Extracts the raw token from a scanned payload, or null when it is not one of ours. */
export function parseQrPayload(raw: string): string | null {
  const value = raw.trim()
  const token = value.startsWith(QR_PREFIX) ? value.slice(QR_PREFIX.length) : value
  return TOKEN_RE.test(token) ? token : null
}

export function homePathForRole(role: AppRole) {
  return role === 'student' ? '/app/alumno' : '/app/acceso'
}
