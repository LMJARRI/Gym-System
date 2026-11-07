'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDuration, formatMoney, type DurationUnit, type Plan } from '@/lib/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/native-select'
import { EmptyState } from '@/components/page-header'
import { cn } from '@/lib/utils'

type Draft = Omit<Plan, 'id'> & { id?: string }
const EMPTY: Draft = { name: '', description: '', price: 0, duration_count: 1, duration_unit: 'month', status: 'active', access_rules: '', notes: '' }

export function PlansManager({ gymId, currency, plans }: { gymId: string; currency: string; plans: Plan[] }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    if (draft.name.trim().length === 0) return toast.error('Ingresá un nombre.')
    if (!(draft.price >= 0)) return toast.error('El precio no es válido.')
    if (!Number.isInteger(draft.duration_count) || draft.duration_count < 1 || draft.duration_count > 365) return toast.error('La duración no es válida.')
    setSaving(true)
    const row = {
      name: draft.name.trim(),
      description: draft.description?.trim() || null,
      price: draft.price,
      duration_count: draft.duration_count,
      duration_unit: draft.duration_unit,
      access_rules: draft.access_rules?.trim() || null,
      notes: draft.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const supabase = createClient()
    const { error } = draft.id
      ? await supabase.from('plans').update(row).eq('id', draft.id)
      : await supabase.from('plans').insert({ ...row, gym_id: gymId })
    setSaving(false)
    if (error) return toast.error(error.code === '23505' ? 'Ya existe un plan con ese nombre.' : 'No se pudo guardar el plan.')
    toast.success(draft.id ? 'Plan actualizado. Las membresías existentes conservan su precio.' : 'Plan creado')
    setDraft(null)
    router.refresh()
  }

  async function toggleArchive(plan: Plan) {
    const status = plan.status === 'active' ? 'archived' : 'active'
    const { error } = await createClient().from('plans').update({ status, updated_at: new Date().toISOString() }).eq('id', plan.id)
    if (error) return toast.error('No se pudo actualizar el plan.')
    toast.success(status === 'archived' ? 'Plan archivado' : 'Plan reactivado')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setDraft({ ...EMPTY })}>
          <Plus aria-hidden="true" />
          Nuevo plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <EmptyState title="Todavía no hay planes" detail="Creá tu primer plan para poder asignarlo a los alumnos." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <li key={p.id} className={cn('flex flex-col gap-3 rounded-2xl border bg-card p-4', p.status === 'archived' && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-bold">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{formatDuration(p.duration_count, p.duration_unit)}</span>
                </div>
                {p.status === 'archived' && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">Archivado</span>}
              </div>
              <span className="font-mono text-2xl font-bold tabular-nums">{formatMoney(Number(p.price), currency)}</span>
              {p.description && <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p>}
              {p.access_rules && <p className="text-xs text-muted-foreground">Acceso: {p.access_rules}</p>}
              <div className="mt-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDraft({ ...p })}>Editar</Button>
                <Button variant="ghost" size="sm" onClick={() => toggleArchive(p)}>
                  {p.status === 'active' ? 'Archivar' : 'Reactivar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Editar plan' : 'Nuevo plan'}</DialogTitle>
          </DialogHeader>
          {draft && (
            <form id="plan-form" onSubmit={save} className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="p-name">Nombre</Label>
                <Input id="p-name" required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-10" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="p-price">Precio ({currency})</Label>
                <Input id="p-price" type="number" min={0} step="0.01" required value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} className="h-10 font-mono" />
              </div>
              <div className="flex gap-2">
                <div className="flex w-20 flex-col gap-2">
                  <Label htmlFor="p-count">Duración</Label>
                  <Input id="p-count" type="number" min={1} max={365} required value={draft.duration_count} onChange={(e) => setDraft({ ...draft, duration_count: Number(e.target.value) })} className="h-10 font-mono" />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="p-unit">Unidad</Label>
                  <NativeSelect id="p-unit" value={draft.duration_unit} onChange={(e) => setDraft({ ...draft, duration_unit: e.target.value as DurationUnit })}>
                    <option value="day">Días</option>
                    <option value="week">Semanas</option>
                    <option value="month">Meses</option>
                  </NativeSelect>
                </div>
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="p-desc">Descripción</Label>
                <Textarea id="p-desc" maxLength={500} value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="p-rules">Reglas de acceso</Label>
                <Input id="p-rules" maxLength={300} placeholder="Ej.: libre, 3 veces por semana" value={draft.access_rules ?? ''} onChange={(e) => setDraft({ ...draft, access_rules: e.target.value })} className="h-10" />
              </div>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button type="submit" form="plan-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
