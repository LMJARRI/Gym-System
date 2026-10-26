'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { rpcErrorMessage, type PaymentMethod } from '@/lib/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/native-select'

async function fetchStudents([, gymId]: [string, string]) {
  const { data, error } = await createClient()
    .from('profiles')
    .select('id, full_name, member_number')
    .eq('gym_id', gymId)
    .eq('role', 'student')
    .order('full_name')
  if (error) throw error
  return data ?? []
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  gymId,
  currency,
  studentId,
  onRecorded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  gymId: string
  currency: string
  studentId?: string
  onRecorded: () => void
}) {
  const { data: students } = useSWR(open && !studentId ? (['students-min', gymId] as const) : null, fetchStudents)
  const [student, setStudent] = useState(studentId ?? '')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [detail, setDetail] = useState('')
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    const target = studentId ?? student
    if (!target) return toast.error('Elegí un alumno.')
    if (!(value > 0)) return toast.error('El monto debe ser mayor a cero.')
    setBusy(true)
    const { error } = await createClient().rpc('owner_record_payment', {
      p_student: target,
      p_amount: value,
      p_method: method,
      p_method_detail: detail.trim() || null,
      p_paid_on: paidOn,
      p_notes: notes.trim() || null,
      p_request_id: requestId,
    })
    setBusy(false)
    if (error) return toast.error(rpcErrorMessage(error, 'No se pudo registrar el pago'))
    toast.success('Pago registrado y aplicado')
    setAmount('')
    setDetail('')
    setNotes('')
    setRequestId(crypto.randomUUID())
    onOpenChange(false)
    onRecorded()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>Para pagos en efectivo u otros medios recibidos en el gimnasio. Se aprueba al registrarlo.</DialogDescription>
        </DialogHeader>
        <form id="record-payment" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          {!studentId && (
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="rp-student">Alumno</Label>
              <NativeSelect id="rp-student" required value={student} onChange={(e) => setStudent(e.target.value)}>
                <option value="">Elegí un alumno…</option>
                {students?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || 'Sin nombre'}{s.member_number != null ? ` (#${s.member_number})` : ''}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="rp-amount">Monto ({currency})</Label>
            <Input id="rp-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 font-mono" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rp-date">Fecha de pago</Label>
            <Input id="rp-date" type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="h-10" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rp-method">Medio</Label>
            <NativeSelect id="rp-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="other">Otro</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rp-detail">Detalle</Label>
            <Input id="rp-detail" maxLength={100} placeholder="Ej.: tarjeta de débito" value={detail} onChange={(e) => setDetail(e.target.value)} className="h-10" />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="rp-notes">Notas</Label>
            <Textarea id="rp-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="record-payment" disabled={busy}>{busy ? 'Registrando…' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
