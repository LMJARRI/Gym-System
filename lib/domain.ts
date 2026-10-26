export type AppRole = 'owner' | 'staff' | 'teacher' | 'student'
export type MembershipStatus = 'active' | 'pending_payment' | 'suspended' | 'expired' | 'cancelled'
export type AccountStatus = 'active' | 'inactive'

export type Profile = {
  id: string
  gym_id: string | null
  role: AppRole
  full_name: string
  avatar_url: string | null
  member_number: number | null
  email: string | null
  phone: string | null
  birth_date: string | null
  account_status: AccountStatus
}

export type Gym = {
  id: string
  name: string
  timezone: string
  join_code: string
  qr_ttl_seconds: number
  allow_pending_payment: boolean
  pending_grace_days: number
  address: string | null
  phone: string | null
  contact_email: string | null
  logo_url: string | null
  currency: string
  transfer_instructions: string | null
  welcome_message: string | null
  opening_hours: string | null
  day_cutoff_hour: number
  expiry_notice_days: number
  renewal_policy: 'from_end' | 'from_today'
  teachers_can_scan: boolean
}

export const PROFILE_COLUMNS = 'id, gym_id, role, full_name, avatar_url, member_number, email, phone, birth_date, account_status'
export const GYM_COLUMNS =
  'id, name, timezone, join_code, qr_ttl_seconds, allow_pending_payment, pending_grace_days, address, phone, contact_email, logo_url, currency, transfer_instructions, welcome_message, opening_hours, day_cutoff_hour, expiry_notice_days, renewal_policy, teachers_can_scan'

export type Membership = {
  id: string
  student_id: string
  plan_id?: string | null
  plan_name: string
  status: MembershipStatus
  starts_on: string
  ends_on: string
  agreed_price?: number
  balance_due?: number
  renewal_count?: number
  notes?: string | null
}
export const MEMBERSHIP_COLUMNS = 'id, student_id, plan_id, plan_name, status, starts_on, ends_on, agreed_price, balance_due, renewal_count, notes'

export type DurationUnit = 'day' | 'week' | 'month'
export type Plan = {
  id: string
  name: string
  description: string | null
  price: number
  duration_count: number
  duration_unit: DurationUnit
  status: 'active' | 'archived'
  access_rules: string | null
  notes: string | null
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'void'
export type PaymentMethod = 'transfer' | 'cash' | 'other'
export type Payment = {
  id: string
  student_id: string
  amount: number
  method: PaymentMethod
  method_detail: string | null
  declared_paid_on: string
  submitted_at: string
  receipt_path: string | null
  status: PaymentStatus
  applied_amount: number
  verified_at: string | null
  review_notes: string | null
  notes: string | null
}
export const PAYMENT_COLUMNS =
  'id, student_id, amount, method, method_detail, declared_paid_on, submitted_at, receipt_path, status, applied_amount, verified_at, review_notes, notes'

export type RoutineStatus = 'draft' | 'active' | 'finished' | 'archived'

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  void: 'Anulado',
}
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: 'Transferencia',
  cash: 'Efectivo',
  other: 'Otro',
}
export const DURATION_LABEL: Record<DurationUnit, [string, string]> = {
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
}
export const ROUTINE_STATUS_LABEL: Record<RoutineStatus, string> = {
  draft: 'Borrador',
  active: 'Activa',
  finished: 'Finalizada',
  archived: 'Archivada',
}

export function formatDuration(count: number, unit: DurationUnit) {
  return `${count} ${DURATION_LABEL[unit][count === 1 ? 0 : 1]}`
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

/** Maps RPC exception messages to user-facing Spanish copy. */
export function rpcErrorMessage(error: { message?: string } | null | undefined, fallback = 'No se pudo completar la operación') {
  const map: Record<string, string> = {
    forbidden: 'No tenés permiso para esta acción.',
    already_reviewed: 'Este pago ya fue revisado.',
    duplicate_receipt: 'Ese comprobante ya fue enviado.',
    duplicate_pending: 'Ya tenés un comprobante pendiente por ese monto y fecha.',
    receipt_not_uploaded: 'El comprobante no terminó de subirse. Probá de nuevo.',
    invalid_amount: 'El monto no es válido.',
    invalid_date: 'La fecha no es válida.',
    reason_required: 'Indicá un motivo.',
    plan_required: 'Asigná un plan antes de renovar.',
    plan_not_found: 'El plan no existe o está archivado.',
    membership_not_found: 'El alumno no tiene membresía.',
    already_present: 'El alumno ya tiene asistencia ese día.',
    not_found: 'No se encontró el registro.',
    not_approved: 'Solo se pueden anular pagos aprobados.',
    exercises_required: 'Agregá al menos un ejercicio.',
    name_required: 'Ingresá un nombre.',
    routine_not_found: 'La rutina no está disponible.',
    cannot_change_self: 'No podés cambiar tu propio estado.',
    invalid_timezone: 'Zona horaria inválida.',
    student_not_found: 'Alumno no encontrado.',
  }
  const key = Object.keys(map).find((k) => error?.message?.includes(k))
  return key ? map[key] : fallback
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
  | 'membership_cancelled'
  | 'account_inactive'
  | 'override'

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
  cancelled: 'Cancelada',
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
  membership_cancelled: { title: 'Membresía cancelada', detail: 'La membresía del alumno fue cancelada.' },
  account_inactive: { title: 'Cuenta inactiva', detail: 'La cuenta del alumno está desactivada.' },
  override: { title: 'Ingreso por excepción', detail: 'Autorizado por una excepción vigente cargada por el dueño.' },
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
  switch (role) {
    case 'owner':
      return '/app/resumen'
    case 'teacher':
      return '/app/alumnos'
    case 'staff':
      return '/app/acceso'
    default:
      return '/app/alumno'
  }
}
