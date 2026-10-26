'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { MEMBERSHIP_LABEL, type Membership, type MembershipStatus } from '@/lib/domain'
import { todayIn } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Member } from '@/components/admin/members-manager'

const STATUSES: MembershipStatus[] = ['active', 'pending_payment', 'suspended', 'expired']

function plusDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

type Props = {
  gymId: string
  timeZone: string
  member: Member
  membership: Membership | null
  onClose: () => void
  onSaved: () => void
}

export function MembershipDialog({ gymId, timeZone, member, membership, onClose, onSaved }: Props) {
  const today = todayIn(timeZone)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    plan_name: membership?.plan_name ?? 'Mensual',
    status: membership?.status ?? ('active' as MembershipStatus),
    starts_on: membership?.starts_on ?? today,
    ends_on: membership?.ends_on ?? plusDays(today, 30),
  })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (form.ends_on < form.starts_on) {
      toast.error('La fecha de fin debe ser posterior al inicio')
      return
    }
    setSaving(true)
    const { error } = await createClient()
      .from('memberships')
      .upsert(
        { gym_id: gymId, student_id: member.id, plan_name: form.plan_name.trim(), status: form.status, starts_on: form.starts_on, ends_on: form.ends_on, updated_at: new Date().toISOString() },
        { onConflict: 'student_id' },
      )
    setSaving(false)
    if (error) {
      toast.error('No se pudo guardar la membresía')
      return
    }
    toast.success('Membresía actualizada')
    onSaved()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Membresía</DialogTitle>
          <DialogDescription>{member.full_name || 'Alumno'}</DialogDescription>
        </DialogHeader>
        <form id="membership-form" onSubmit={save} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="plan">Plan</Label>
            <Input id="plan" required maxLength={80} value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })} className="h-10" />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="status">Estado</Label>
            <select
              id="status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as MembershipStatus })}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {MEMBERSHIP_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="starts">Inicio</Label>
            <Input id="starts" type="date" required value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} className="h-10" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ends">Fin</Label>
            <Input id="ends" type="date" required min={form.starts_on} value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} className="h-10" />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="membership-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
