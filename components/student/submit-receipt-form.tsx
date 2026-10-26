'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { rpcErrorMessage } from '@/lib/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
const MAX = 5 * 1024 * 1024

export function SubmitReceiptForm({ gymId, userId, currency, suggested, disabled }: { gymId: string; userId: string; currency: string; suggested?: number; disabled?: boolean }) {
  const router = useRouter()
  const [amount, setAmount] = useState(suggested ? String(suggested) : '')
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [uploadedPath, setUploadedPath] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!(value > 0)) return toast.error('Ingresá el monto pagado.')
    if (!file) return toast.error('Adjuntá el comprobante.')
    if (!TYPES[file.type]) return toast.error('El comprobante debe ser JPG, PNG, WebP o PDF.')
    if (file.size > MAX) return toast.error('El archivo supera los 5 MB.')

    setBusy(true)
    const supabase = createClient()
    let path = uploadedPath
    if (!path) {
      path = `${gymId}/${userId}/${requestId}.${TYPES[file.type]}`
      const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type, upsert: false })
      if (upErr && !/exists|duplicate/i.test(upErr.message)) {
        setBusy(false)
        return toast.error('No se pudo subir el comprobante.')
      }
      setUploadedPath(path)
    }
    const { error } = await supabase.rpc('submit_payment', {
      p_amount: value,
      p_declared_paid_on: paidOn,
      p_receipt_path: path,
      p_notes: notes.trim() || null,
      p_request_id: requestId,
    })
    setBusy(false)
    if (error) return toast.error(rpcErrorMessage(error, 'No se pudo enviar el pago'))
    toast.success('Comprobante enviado. Te avisamos cuando se revise.')
    setFile(null)
    setNotes('')
    setUploadedPath(null)
    setRequestId(crypto.randomUUID())
    ;(e.target as HTMLFormElement).reset()
    router.refresh()
  }

  if (disabled) {
    return <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Necesitás una membresía asignada para informar pagos.</p>
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border bg-card p-5 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="sp-amount">Monto ({currency})</Label>
        <Input id="sp-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 font-mono" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sp-date">Fecha de la transferencia</Label>
        <Input id="sp-date" type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="h-10" />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Label htmlFor="sp-file">Comprobante</Label>
        <Input
          id="sp-file"
          type="file"
          required
          accept={Object.keys(TYPES).join(',')}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setUploadedPath(null)
            setRequestId(crypto.randomUUID())
          }}
          className="h-10"
        />
        <p className="text-xs text-muted-foreground">JPG, PNG, WebP o PDF, hasta 5 MB. Solo lo ve el gimnasio.</p>
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Label htmlFor="sp-notes">Nota (opcional)</Label>
        <Textarea id="sp-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end md:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar comprobante'}</Button>
      </div>
    </form>
  )
}
