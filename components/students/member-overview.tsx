'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  formatDuration,
  formatMoney,
  MEMBERSHIP_LABEL,
  PAYMENT_METHOD_LABEL,
  rpcErrorMessage,
  type Membership,
  type MembershipStatus,
  type Payment,
  type Plan,
} from '@/lib/domain'
import { formatDateTime, formatLocalDate } from '@/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MembershipBadge } from '@/components/membership-badge'
import { NativeSelect } from '@/components/native-select'
import { SectionTitle } from '@/components/page-header'
import { PaymentStatusBadge } from '@/components/payment-status-badge'
import { RecordPaymentDialog } from '@/components/admin/record-payment-dialog'
import { openReceipt } from '@/components/admin/payments-review'
import { initials } from '@/components/profile-form'

type Student = {
  id: string
  full_name: string
  member_number: number | null
  email: string | null
  phone: string | null
  birth_date: string | null
  avatar_url: string | null
  account_status: 'active' | 'inactive'
  joined_at: string | null
}

type Props = {
  student: Student
  membership: Membership | null
  plans: Plan[]
  payments: Payment[]
  gymId: string
  currency: string
  timeZone: string
  renewalPolicy: 'from_end' | 'from_today'
  today: string
  isOwner: boolean
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

export function MemberOverview(props: Props) {
  const { student, membership, plans, payments, gymId, currency, timeZone, renewalPolicy, today, isOwner } = props
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [renewing, setRenewing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)

  const [info, setInfo] = useState({ full_name: student.full_name, phone: student.phone ?? '', birth_date: student.birth_date ?? '' })
  const [assign, setAssign] = useState({ plan: plans[0]?.id ?? '', starts_on: today, price: '' })
  const [renew, setRenew] = useState({ mode: renewalPolicy as string, starts_on: today })
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const expired = membership && membership.ends_on < today && (membership.status === 'active' || membership.status === 'pending_payment')
  const shownStatus: MembershipStatus | null = membership ? (expired ? 'expired' : membership.status) : null
  const selectedPlan = plans.find((p) => p.id === assign.plan)

  async function run(fn: () => PromiseLike<{ error: { message?: string } | null }>, success: string) {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) {
      toast.error(rpcErrorMessage(error))
      return false
    }
    toast.success(success)
    setRequestId(crypto.randomUUID())
    router.refresh()
    return true
  }

  const supabase = createClient()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {student.avatar_url && <AvatarImage src={student.avatar_url} alt="" />}
            <AvatarFallback className="text-lg font-bold">{initials(student.full_name)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <h1 className="text-balance font-sans text-2xl font-bold tracking-tight">{student.full_name || 'Sin nombre'}</h1>
            <p className="text-sm text-muted-foreground">
              {student.member_number != null && <span className="font-mono">Socio #{student.member_number}</span>}
              {student.joined_at && ` · Alta ${formatLocalDate(student.joined_at.slice(0, 10), { day: '2-digit', month: 'short', year: 'numeric' })}`}
            </p>
          </div>
        </div>
        {isOwner && (
          <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-2">
            <Label htmlFor="acct">Cuenta activa</Label>
            <Switch
              id="acct"
              checked={student.account_status === 'active'}
              disabled={busy}
              onCheckedChange={(v) =>
                run(
                  () => supabase.rpc('owner_set_account_status', { p_user: student.id, p_status: v ? 'active' : 'inactive' }),
                  v ? 'Cuenta reactivada' : 'Cuenta desactivada. El alumno no puede ingresar ni generar QR.',
                )
              }
            />
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="data-title" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionTitle id="data-title">Datos</SectionTitle>
            {isOwner && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Editar</Button>}
          </div>
          <dl className="divide-y rounded-2xl border bg-card px-4">
            <Row label="Email">{student.email ?? '—'}</Row>
            <Row label="Teléfono">{student.phone || '—'}</Row>
            <Row label="Nacimiento">{student.birth_date ? formatLocalDate(student.birth_date, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</Row>
          </dl>
        </section>

        <section aria-labelledby="membership-title" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionTitle id="membership-title">Membresía</SectionTitle>
            {isOwner && (
              <div className="flex gap-2">
                {membership && <Button variant="outline" size="sm" onClick={() => setRenewing(true)}>Renovar</Button>}
                <Button size="sm" onClick={() => setAssigning(true)} disabled={plans.length === 0}>
                  {membership ? 'Cambiar plan' : 'Asignar plan'}
                </Button>
              </div>
            )}
          </div>
          {membership ? (
            <dl className="divide-y rounded-2xl border bg-card px-4">
              <Row label="Plan">{membership.plan_name}</Row>
              <Row label="Estado">{shownStatus && <MembershipBadge status={shownStatus} />}</Row>
              <Row label="Período">
                {formatLocalDate(membership.starts_on, { day: '2-digit', month: 'short' })} – {formatLocalDate(membership.ends_on, { day: '2-digit', month: 'short', year: 'numeric' })}
              </Row>
              {isOwner && <Row label="Precio acordado"><span className="font-mono">{formatMoney(Number(membership.agreed_price ?? 0), currency)}</span></Row>}
              {isOwner && (
                <Row label="Saldo pendiente">
                  <span className={Number(membership.balance_due) > 0 ? 'font-mono text-primary' : 'font-mono'}>{formatMoney(Number(membership.balance_due ?? 0), currency)}</span>
                </Row>
              )}
              <Row label="Renovaciones">{membership.renewal_count ?? 0}</Row>
              {isOwner && (
                <div className="flex items-center justify-between gap-4 py-2">
                  <Label htmlFor="m-status" className="text-sm font-normal text-muted-foreground">Cambiar estado</Label>
                  <NativeSelect
                    id="m-status"
                    className="w-48"
                    value={membership.status}
                    disabled={busy}
                    onChange={(e) =>
                      run(
                        () => supabase.from('memberships').update({ status: e.target.value, updated_at: new Date().toISOString() }).eq('id', membership.id),
                        'Estado actualizado',
                      )
                    }
                  >
                    {(Object.keys(MEMBERSHIP_LABEL) as MembershipStatus[]).map((s) => (
                      <option key={s} value={s}>{MEMBERSHIP_LABEL[s]}</option>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </dl>
          ) : (
            <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              Sin membresía. {isOwner && plans.length === 0 ? 'Creá un plan primero en Planes.' : ''}
            </p>
          )}
        </section>
      </div>

      {isOwner && (
        <section aria-labelledby="payments-title" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionTitle id="payments-title">Pagos</SectionTitle>
            <Button variant="outline" size="sm" onClick={() => setRecording(true)}>Registrar pago</Button>
          </div>
          {payments.length > 0 ? (
            <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="flex flex-col">
                    <span className="font-mono font-semibold tabular-nums">{formatMoney(Number(p.amount), currency)}</span>
                    <span className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABEL[p.method]} · {formatDateTime(p.submitted_at, timeZone)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {p.receipt_path && (
                      <Button variant="ghost" size="icon-sm" aria-label="Ver comprobante" onClick={() => openReceipt(p.receipt_path!)}>
                        <FileText aria-hidden="true" />
                      </Button>
                    )}
                    <PaymentStatusBadge status={p.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>
          )}
        </section>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar datos</DialogTitle></DialogHeader>
          <form
            id="edit-member"
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              const ok = await run(
                () => supabase.rpc('owner_update_member', { p_user: student.id, p_full_name: info.full_name.trim(), p_phone: info.phone.trim() || null, p_birth_date: info.birth_date || null }),
                'Datos actualizados',
              )
              if (ok) setEditing(false)
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-name">Nombre y apellido</Label>
              <Input id="e-name" required maxLength={120} value={info.full_name} onChange={(e) => setInfo({ ...info, full_name: e.target.value })} className="h-10" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-phone">Teléfono</Label>
              <Input id="e-phone" type="tel" maxLength={40} value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} className="h-10" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-birth">Fecha de nacimiento</Label>
              <Input id="e-birth" type="date" value={info.birth_date} onChange={(e) => setInfo({ ...info, birth_date: e.target.value })} className="h-10" />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button type="submit" form="edit-member" disabled={busy}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assigning} onOpenChange={setAssigning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{membership ? 'Cambiar plan' : 'Asignar plan'}</DialogTitle>
            <DialogDescription>
              Se crea un período nuevo con saldo igual al precio acordado. Queda en &quot;Pago pendiente&quot; hasta que se apruebe un pago.
            </DialogDescription>
          </DialogHeader>
          <form
            id="assign-plan"
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!assign.plan) return toast.error('Elegí un plan.')
              const ok = await run(
                () =>
                  supabase.rpc('owner_assign_plan', {
                    p_student: student.id,
                    p_plan: assign.plan,
                    p_starts_on: assign.starts_on,
                    p_agreed_price: assign.price === '' ? null : Number(assign.price),
                    p_notes: null,
                    p_request_id: requestId,
                  }),
                'Plan asignado',
              )
              if (ok) setAssigning(false)
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="a-plan">Plan</Label>
              <NativeSelect id="a-plan" value={assign.plan} onChange={(e) => setAssign({ ...assign, plan: e.target.value })}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatDuration(p.duration_count, p.duration_unit)} · {formatMoney(Number(p.price), currency)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="a-start">Inicio</Label>
                <Input id="a-start" type="date" required value={assign.starts_on} onChange={(e) => setAssign({ ...assign, starts_on: e.target.value })} className="h-10" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="a-price">Precio acordado</Label>
                <Input
                  id="a-price"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={selectedPlan ? String(selectedPlan.price) : ''}
                  value={assign.price}
                  onChange={(e) => setAssign({ ...assign, price: e.target.value })}
                  className="h-10 font-mono"
                />
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigning(false)}>Cancelar</Button>
            <Button type="submit" form="assign-plan" disabled={busy}>Asignar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renewing} onOpenChange={setRenewing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renovar membresía</DialogTitle>
            <DialogDescription>Se agrega un período del mismo plan al precio actual. Si había saldo pendiente, se acumula.</DialogDescription>
          </DialogHeader>
          <form
            id="renew"
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              const ok = await run(
                () => supabase.rpc('owner_renew_membership', { p_student: student.id, p_mode: renew.mode, p_starts_on: renew.mode === 'custom' ? renew.starts_on : null, p_request_id: requestId }),
                'Membresía renovada',
              )
              if (ok) setRenewing(false)
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="r-mode">El nuevo período empieza</Label>
              <NativeSelect id="r-mode" value={renew.mode} onChange={(e) => setRenew({ ...renew, mode: e.target.value })}>
                <option value="from_end">Al terminar el actual{membership ? ` (${formatLocalDate(membership.ends_on, { day: '2-digit', month: 'short' })})` : ''}</option>
                <option value="from_today">Hoy</option>
                <option value="custom">En otra fecha</option>
              </NativeSelect>
            </div>
            {renew.mode === 'custom' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="r-start">Fecha de inicio</Label>
                <Input id="r-start" type="date" required value={renew.starts_on} onChange={(e) => setRenew({ ...renew, starts_on: e.target.value })} className="h-10" />
              </div>
            )}
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewing(false)}>Cancelar</Button>
            <Button type="submit" form="renew" disabled={busy}>Renovar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isOwner && (
        <RecordPaymentDialog
          open={recording}
          onOpenChange={setRecording}
          gymId={gymId}
          currency={currency}
          studentId={student.id}
          onRecorded={() => router.refresh()}
        />
      )}
    </div>
  )
}
