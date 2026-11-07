'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { formatLocalDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SectionTitle } from '@/components/page-header'

export type Measurement = {
  id: string
  measured_on: string
  weight_kg: number | null
  height_cm: number | null
  chest_cm: number | null
  waist_cm: number | null
  hip_cm: number | null
  arm_cm: number | null
  thigh_cm: number | null
  notes: string | null
}

const FIELDS = [
  ['weight_kg', 'Peso', 'kg', 20, 400],
  ['height_cm', 'Altura', 'cm', 50, 260],
  ['chest_cm', 'Pecho', 'cm', 10, 300],
  ['waist_cm', 'Cintura', 'cm', 10, 300],
  ['hip_cm', 'Cadera', 'cm', 10, 300],
  ['arm_cm', 'Brazo', 'cm', 10, 300],
  ['thigh_cm', 'Muslo', 'cm', 10, 300],
] as const

type FieldKey = (typeof FIELDS)[number][0]

export function MeasurementsPanel({ studentId, gymId, rows, canEdit }: { studentId: string; gymId: string; rows: Measurement[]; canEdit: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  const latest = rows[0]
  const previous = rows[1]

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const row: Record<string, unknown> = { gym_id: gymId, student_id: studentId, measured_on: date, notes: values.notes?.trim() || null }
    let any = false
    for (const [key, label, , min, max] of FIELDS) {
      const raw = values[key]
      if (!raw) continue
      const n = Number(raw)
      if (!(n >= min && n <= max)) return toast.error(`${label} fuera de rango (${min}–${max}).`)
      row[key] = n
      any = true
    }
    if (!any) return toast.error('Cargá al menos una medida.')
    setBusy(true)
    const { error } = await createClient().from('body_measurements').insert(row)
    setBusy(false)
    if (error) return toast.error('No se pudo guardar la medición.')
    toast.success('Medición guardada')
    setOpen(false)
    setValues({})
    router.refresh()
  }

  return (
    <section aria-labelledby="meas-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionTitle id="meas-title">Medidas corporales</SectionTitle>
        {canEdit && <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Nueva medición</Button>}
      </div>

      {latest ? (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {FIELDS.map(([key, label, unit]) => {
              const v = latest[key as FieldKey]
              if (v == null) return null
              const prev = previous?.[key as FieldKey]
              const delta = prev != null ? Number(v) - Number(prev) : null
              return (
                <div key={key} className="flex flex-col gap-0.5 rounded-2xl border bg-card p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-xl font-bold tabular-nums">
                    {Number(v)} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
                  </dd>
                  {delta != null && delta !== 0 && (
                    <dd className="font-mono text-xs text-muted-foreground">
                      {delta > 0 ? '+' : ''}
                      {delta.toFixed(1)} vs. anterior
                    </dd>
                  )}
                </div>
              )
            })}
          </dl>
          <p className="text-xs text-muted-foreground">
            Última medición: {formatLocalDate(latest.measured_on, { day: '2-digit', month: 'short', year: 'numeric' })} · {rows.length} registros
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sin mediciones registradas.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva medición</DialogTitle></DialogHeader>
          <form id="measure" onSubmit={save} className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-2">
              <Label htmlFor="m-date">Fecha</Label>
              <Input id="m-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
            </div>
            {FIELDS.map(([key, label, unit, min, max]) => (
              <div key={key} className="flex flex-col gap-2">
                <Label htmlFor={`m-${key}`}>{label} ({unit})</Label>
                <Input
                  id={`m-${key}`}
                  type="number"
                  step="0.1"
                  min={min}
                  max={max}
                  value={values[key] ?? ''}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                  className="h-10 font-mono"
                />
              </div>
            ))}
            <div className="col-span-2 flex flex-col gap-2">
              <Label htmlFor="m-notes">Notas</Label>
              <Input id="m-notes" maxLength={500} value={values.notes ?? ''} onChange={(e) => setValues({ ...values, notes: e.target.value })} className="h-10" />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" form="measure" disabled={busy}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
