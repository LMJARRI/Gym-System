'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Member } from '@/components/admin/members-manager'

type Props = {
  gymId: string
  teacher: Member
  students: Member[]
  assigned: Set<string>
  onClose: () => void
  onSaved: () => void
}

export function TeacherStudentsDialog({ gymId, teacher, students, assigned, onClose, onSaved }: Props) {
  const [selected, setSelected] = useState(() => new Set(assigned))
  const [saving, setSaving] = useState(false)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const toAdd = [...selected].filter((id) => !assigned.has(id))
    const toRemove = [...assigned].filter((id) => !selected.has(id))
    const results = await Promise.all([
      toAdd.length
        ? supabase.from('teacher_students').insert(toAdd.map((student_id) => ({ gym_id: gymId, teacher_id: teacher.id, student_id })))
        : Promise.resolve({ error: null }),
      toRemove.length
        ? supabase.from('teacher_students').delete().eq('teacher_id', teacher.id).in('student_id', toRemove)
        : Promise.resolve({ error: null }),
    ])
    setSaving(false)
    if (results.some((r) => r.error)) {
      toast.error('No se pudieron guardar las asignaciones')
      return
    }
    toast.success('Asignaciones guardadas')
    onSaved()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alumnos de {teacher.full_name || 'este profesor'}</DialogTitle>
          <DialogDescription>Solo podrá registrar ingresos y ver la asistencia de los alumnos seleccionados.</DialogDescription>
        </DialogHeader>
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay alumnos en el gimnasio.</p>
        ) : (
          <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-xl border">
            {students.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="size-4 accent-primary" />
                  <span className="flex-1 truncate">{s.full_name || 'Sin nombre'}</span>
                  <span className="font-mono text-xs text-muted-foreground">Nº {String(s.member_number ?? 0).padStart(4, '0')}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
