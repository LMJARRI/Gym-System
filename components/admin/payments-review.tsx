'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { FileText, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  formatMoney,
  PAYMENT_COLUMNS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  rpcErrorMessage,
  type Payment,
  type PaymentStatus,
} from '@/lib/domain'
import { formatDateTime, formatLocalDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/page-header'
import { PaymentStatusBadge } from '@/components/payment-status-badge'
import { RecordPaymentDialog } from '@/components/admin/record-payment-dialog'
import { cn } from '@/lib/utils'

type Row = Payment & { profiles: { full_name: string; member_number: number | null } | null }
const STATUSES: PaymentStatus[] = ['pending', 'approved', 'rejected', 'void']

async function fetchPayments([, gymId, status]: [string, string, PaymentStatus]) {
  const { data, error } = await createClient()
    .from('payments')
    .select(`${PAYMENT_COLUMNS}, profiles!payments_student_id_fkey(full_name, member_number)`)
    .eq('gym_id', gymId)
    .eq('status', status)
    .order('submitted_at', { ascending: status === 'pending' })
    .limit(200)
  if (error) throw error
  return (data ?? []) as unknown as Row[]
}

export async function openReceipt(path: string) {
  const { data, error } = await createClient().storage.from('receipts').createSignedUrl(path, 120)
  if (error || !data) return toast.error('No se pudo abrir el comprobante.')
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

export function PaymentsReview({ gymId, currency, timeZone, initialStatus }: { gymId: string; currency: string; timeZone: string; initialStatus: PaymentStatus }) {
  const [status, setStatus] = useState<PaymentStatus>(initialStatus)
  const { data, isLoading, error, mutate } = useSWR(['payments', gymId, status] as const, fetchPayments)
  const [action, setAction] = useState<{ payment: Row; kind: 'approve' | 'reject' | 'void' } | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)

  async function confirm() {
    if (!action) return
    if ((action.kind === 'reject' || action.kind === 'void') && notes.trim().length < 3) return toast.error('Indicá un motivo.')
    setBusy(true)
    const supabase = createClient()
    const { error } =
      action.kind === 'void'
        ? await supabase.rpc('owner_void_payment', { p_payment: action.payment.id, p_reason: notes.trim() })
        : await supabase.rpc('owner_review_payment', { p_payment: action.payment.id, p_approve: action.kind === 'approve', p_notes: notes.trim() || null })
    setBusy(false)
    if (error) return toast.error(rpcErrorMessage(error))
    toast.success(action.kind === 'approve' ? 'Pago aprobado y aplicado a la membresía' : action.kind === 'reject' ? 'Pago rechazado' : 'Pago anulado')
    setAction(null)
    setNotes('')
    mutate()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Estado" className="flex gap-1 rounded-xl border bg-card p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              role="tab"
              type="button"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', status === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {PAYMENT_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <Button onClick={() => setRecording(true)}>
          <Plus aria-hidden="true" />
          Registrar pago
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : error ? (
        <p className="text-sm text-destructive">No se pudieron cargar los pagos.</p>
      ) : !data || data.length === 0 ? (
        <EmptyState title={status === 'pending' ? 'No hay comprobantes para revisar' : `Sin pagos ${PAYMENT_STATUS_LABEL[status].toLowerCase()}s`} />
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
          {data.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link href={`/app/alumnos/${p.student_id}`} className="truncate font-semibold hover:underline">
                  {p.profiles?.full_name || 'Sin nombre'}
                  {p.profiles?.member_number != null && <span className="ml-2 font-mono text-xs text-muted-foreground">#{p.profiles.member_number}</span>}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {PAYMENT_METHOD_LABEL[p.method]}
                  {p.method_detail ? ` · ${p.method_detail}` : ''} · Pagado el {formatLocalDate(p.declared_paid_on, { day: '2-digit', month: 'short', year: 'numeric' })} · Enviado {formatDateTime(p.submitted_at, timeZone)}
                </span>
                {p.notes && <span className="text-xs text-muted-foreground">Nota: {p.notes}</span>}
                {p.review_notes && <span className="text-xs text-muted-foreground">Revisión: {p.review_notes}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-bold tabular-nums">{formatMoney(Number(p.amount), currency)}</span>
                {status !== 'pending' && <PaymentStatusBadge status={p.status} />}
                {p.receipt_path && (
                  <Button variant="outline" size="sm" onClick={() => openReceipt(p.receipt_path!)}>
                    <FileText aria-hidden="true" />
                    Comprobante
                  </Button>
                )}
                {p.status === 'pending' && (
                  <>
                    <Button size="sm" onClick={() => setAction({ payment: p, kind: 'approve' })}>Aprobar</Button>
                    <Button size="sm" variant="outline" onClick={() => setAction({ payment: p, kind: 'reject' })}>Rechazar</Button>
                  </>
                )}
                {p.status === 'approved' && (
                  <Button size="sm" variant="ghost" onClick={() => setAction({ payment: p, kind: 'void' })}>Anular</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={action !== null} onOpenChange={(o) => { if (!o) { setAction(null); setNotes('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === 'approve' ? 'Aprobar pago' : action?.kind === 'reject' ? 'Rechazar pago' : 'Anular pago'}
            </DialogTitle>
            <DialogDescription>
              {action && `${action.payment.profiles?.full_name ?? ''} · ${formatMoney(Number(action.payment.amount), currency)}`}
              {action?.kind === 'approve' && '. Se descuenta del saldo de la membresía y, si queda saldada, se activa.'}
              {action?.kind === 'void' && '. Se revierte el monto aplicado a la membresía. Queda registrado en auditoría.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="review-notes">{action?.kind === 'approve' ? 'Nota (opcional)' : 'Motivo'}</Label>
            <Textarea id="review-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Cancelar</Button>
            <Button variant={action?.kind === 'approve' ? 'default' : 'destructive'} disabled={busy} onClick={confirm}>
              {busy ? 'Procesando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecordPaymentDialog open={recording} onOpenChange={setRecording} gymId={gymId} currency={currency} onRecorded={() => { setStatus('approved'); mutate() }} />
    </div>
  )
}
