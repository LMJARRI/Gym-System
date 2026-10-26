'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { rpcErrorMessage } from '@/lib/domain'
import { formatDateTime, formatLocalDate, formatTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SectionTitle } from '@/components/page-header'
import { cn } from '@/lib/utils'

export type AttendanceRow = {
  local_date: string
  first_access_at: string
  last_access_at: string
  access_count: number
  source: 'qr' | 'manual'
  voided_at: string | null
  void_reason: string | null
}

export type OverrideRow = { id: string; valid_from: string; valid_until: string; reason: string; revoked_at: string | null; created_at: string }

type Correction = { action: 'add' | 'void'; date: string; reason: string }

export function MemberAttendance({
  studentId,
  rows,
  overrides,
  gymId,
  timeZone,
  today,
  isOwner,
}: {
  studentId: string
  rows: AttendanceRow[]
  overrides: OverrideRow[]
  gymId: string
  timeZone: string
  today: string
  isOwner: boolean
}) {
  const router = useRouter()
  const [correction, setCorrection] = useState<Correction | null>(null)
  const [override, setOverride] = useState<{ hours: number; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => Date.now())

  async function submitCorrection(e: React.FormEvent) {
    e.preventDefault()
    if (!correction) return
    if (correction.reason.trim().length < 3) return toast.error('Indicá el motivo de la corrección.')
    setBusy(true)
    const { error } = await createClient().rpc('owner_correct_attendance', {
      p_student: studentId,
      p_date: correction.date,
      p_action: correction.action,
      p_reason: correction.reason.trim(),
    })
    setBusy(false)
    if (error) return toast.error(rpcErrorMessage(error))
    toast.success(correction.action === 'add' ? 'Asistencia agregada' : 'Asistencia anulada')
    setCorrection(null)
    router.refresh()
  }

  async function submitOverride(e: React.FormEvent) {
    e.preventDefault()
    if (!override) return
    if (override.reason.trim().length < 3) return toast.error('Indicá el motivo de la excepción.')
    setBusy(true)
    const from = new Date()
    const until = new Date(from.getTime() + override.hours * 3_600_000)
    const { error } = await createClient().from('access_overrides').insert({
      gym_id: gymId,
      student_id: studentId,
      valid_from: from.toISOString(),
      valid_until: until.toISOString(),
      reason: override.reason.trim(),
    })
    setBusy(false)
    if (error) return toast.error('No se pudo crear la excepción.')
    toast.success('Excepción de acceso creada')
    setOverride(null)
    router.refresh()
  }

  async function revokeOverride(id: string) {
    const { error } = await createClient().from('access_overrides').update({ revoked_at: new Date().toISOString() }).eq('id', id)
    if (error) return toast.error('No se pudo revocar la excepción.')
    toast.success('Excepción revocada')
    router.refresh()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="att-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionTitle id="att-title">Asistencias recientes</SectionTitle>
          {isOwner && (
            <Button variant="outline" size="sm" onClick={() => setCorrection({ action: 'add', date: today, reason: '' })}>
              Agregar manual
            </Button>
          )}
        </div>
        {rows.length > 0 ? (
          <ul className="flex max-h-96 flex-col divide-y overflow-y-auto rounded-2xl border bg-card">
            {rows.map((r) => (
              <li key={r.local_date} className={cn('flex items-center justify-between gap-3 px-4 py-2.5', r.voided_at && 'opacity-50')}>
                <span className="flex flex-col">
                  <span className={cn('text-sm font-semibold capitalize', r.voided_at && 'line-through')}>
                    {formatLocalDate(r.local_date, { weekday: 'short', day: '2-digit', month: 'short' })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.source === 'manual' ? 'Carga manual' : `${formatTime(r.first_access_at, timeZone)}${r.access_count > 1 ? ` · ${r.access_count} ingresos` : ''}`}
                    {r.void_reason ? ` · ${r.void_reason}` : ''}
                  </span>
                </span>
                {isOwner && !r.voided_at && (
                  <Button variant="ghost" size="sm" onClick={() => setCorrection({ action: 'void', date: r.local_date, reason: '' })}>
                    Anular
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sin asistencias registradas.</p>
        )}
      </section>

      {isOwner && (
        <section aria-labelledby="ovr-title" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionTitle id="ovr-title">Excepciones de acceso</SectionTitle>
            <Button variant="outline" size="sm" onClick={() => setOverride({ hours: 24, reason: '' })}>
              Nueva excepción
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Permiten ingresar aunque la membresía no esté al día, por tiempo limitado. Quedan auditadas.
          </p>
          {overrides.length > 0 ? (
            <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
              {overrides.map((o) => {
                const live = !o.revoked_at && new Date(o.valid_until).getTime() > now
                return (
                  <li key={o.id} className={cn('flex items-center justify-between gap-3 px-4 py-2.5', !live && 'opacity-50')}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{o.reason}</span>
                      <span className="text-xs text-muted-foreground">
                        Hasta {formatDateTime(o.valid_until, timeZone)}
                        {o.revoked_at ? ' · revocada' : !live ? ' · vencida' : ''}
                      </span>
                    </span>
                    {live && <Button variant="ghost" size="sm" onClick={() => revokeOverride(o.id)}>Revocar</Button>}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sin excepciones.</p>
          )}
        </section>
      )}

      <Dialog open={correction !== null} onOpenChange={(o) => !o && setCorrection(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{correction?.action === 'add' ? 'Agregar asistencia manual' : 'Anular asistencia'}</DialogTitle>
            <DialogDescription>La corrección queda registrada en la auditoría con tu usuario y el motivo.</DialogDescription>
          </DialogHeader>
          {correction && (
            <form id="correction" onSubmit={submitCorrection} className="grid gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-date">Día</Label>
                <Input
                  id="c-date"
                  type="date"
                  max={today}
                  required
                  disabled={correction.action === 'void'}
                  value={correction.date}
                  onChange={(e) => setCorrection({ ...correction, date: e.target.value })}
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-reason">Motivo</Label>
                <Input id="c-reason" required maxLength={300} value={correction.reason} onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} className="h-10" />
              </div>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrection(null)}>Cancelar</Button>
            <Button type="submit" form="correction" disabled={busy} variant={correction?.action === 'void' ? 'destructive' : 'default'}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={override !== null} onOpenChange={(o) => !o && setOverride(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva excepción de acceso</DialogTitle>
            <DialogDescription>Empieza ahora. No reemplaza la membresía ni genera deuda.</DialogDescription>
          </DialogHeader>
          {override && (
            <form id="override" onSubmit={submitOverride} className="grid gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="o-hours">Duración (horas)</Label>
                <Input id="o-hours" type="number" min={1} max={720} required value={override.hours} onChange={(e) => setOverride({ ...override, hours: Number(e.target.value) })} className="h-10 font-mono" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="o-reason">Motivo</Label>
                <Input id="o-reason" required maxLength={300} placeholder="Ej.: paga mañana en efectivo" value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} className="h-10" />
              </div>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverride(null)}>Cancelar</Button>
            <Button type="submit" form="override" disabled={busy}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
