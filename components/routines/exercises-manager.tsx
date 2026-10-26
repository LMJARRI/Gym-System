'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/native-select'
import { EmptyState } from '@/components/page-header'
import { cn } from '@/lib/utils'

export type ExerciseKind = 'strength' | 'cardio' | 'mobility' | 'other'
export type Exercise = {
  id: string
  name: string
  description: string | null
  muscle_group: string
  kind: ExerciseKind
  instructions: string | null
  media_url: string | null
  status: 'active' | 'archived'
}

export const KIND_LABEL: Record<ExerciseKind, string> = { strength: 'Fuerza', cardio: 'Cardio', mobility: 'Movilidad', other: 'Otro' }

type Draft = Omit<Exercise, 'id' | 'status'> & { id?: string }
const EMPTY: Draft = { name: '', description: '', muscle_group: '', kind: 'strength', instructions: '', media_url: '' }

export function ExercisesManager({ gymId, exercises }: { gymId: string; exercises: Exercise[] }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, Exercise[]>()
    for (const e of exercises) {
      if (q && !e.name.toLowerCase().includes(q) && !e.muscle_group.toLowerCase().includes(q)) continue
      map.set(e.muscle_group, [...(map.get(e.muscle_group) ?? []), e])
    }
    return [...map.entries()]
  }, [exercises, query])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    if (!draft.name.trim() || !draft.muscle_group.trim()) return toast.error('Completá nombre y grupo muscular.')
    const media = draft.media_url?.trim() || null
    if (media && !media.startsWith('https://')) return toast.error('El enlace debe empezar con https://')
    setSaving(true)
    const row = {
      name: draft.name.trim(),
      muscle_group: draft.muscle_group.trim(),
      kind: draft.kind,
      description: draft.description?.trim() || null,
      instructions: draft.instructions?.trim() || null,
      media_url: media,
    }
    const supabase = createClient()
    const { error } = draft.id
      ? await supabase.from('exercises').update(row).eq('id', draft.id)
      : await supabase.from('exercises').insert({ ...row, gym_id: gymId })
    setSaving(false)
    if (error) return toast.error(error.code === '23505' ? 'Ya existe un ejercicio con ese nombre.' : 'No se pudo guardar el ejercicio.')
    toast.success(draft.id ? 'Ejercicio actualizado' : 'Ejercicio creado')
    setDraft(null)
    router.refresh()
  }

  async function toggle(ex: Exercise) {
    const status = ex.status === 'active' ? 'archived' : 'active'
    const { error } = await createClient().from('exercises').update({ status }).eq('id', ex.id)
    if (error) return toast.error('No se pudo actualizar.')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Buscar ejercicio" placeholder="Buscar por nombre o grupo" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 pl-9" />
        </div>
        <Button onClick={() => setDraft({ ...EMPTY })}>
          <Plus aria-hidden="true" />
          Nuevo ejercicio
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState title={exercises.length ? 'Sin resultados' : 'La biblioteca está vacía'} detail={exercises.length ? undefined : 'Agregá ejercicios para poder armar rutinas.'} />
      ) : (
        groups.map(([group, items]) => (
          <section key={group} aria-label={group} className="flex flex-col gap-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{group}</h2>
            <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
              {items.map((ex) => (
                <li key={ex.id} className={cn('flex items-center justify-between gap-3 px-4 py-3', ex.status === 'archived' && 'opacity-50')}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{ex.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {KIND_LABEL[ex.kind]}
                      {ex.description ? ` · ${ex.description}` : ''}
                      {ex.status === 'archived' ? ' · archivado' : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setDraft({ ...ex })}>Editar</Button>
                    <Button variant="ghost" size="sm" onClick={() => toggle(ex)}>{ex.status === 'active' ? 'Archivar' : 'Reactivar'}</Button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? 'Editar ejercicio' : 'Nuevo ejercicio'}</DialogTitle></DialogHeader>
          {draft && (
            <form id="exercise" onSubmit={save} className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="x-name">Nombre</Label>
                <Input id="x-name" required maxLength={100} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-10" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="x-group">Grupo muscular</Label>
                <Input id="x-group" required maxLength={40} placeholder="Ej.: Piernas" value={draft.muscle_group} onChange={(e) => setDraft({ ...draft, muscle_group: e.target.value })} className="h-10" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="x-kind">Tipo</Label>
                <NativeSelect id="x-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ExerciseKind })}>
                  {(Object.keys(KIND_LABEL) as ExerciseKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="x-desc">Descripción corta</Label>
                <Input id="x-desc" maxLength={500} value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="h-10" />
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="x-inst">Instrucciones</Label>
                <Textarea id="x-inst" maxLength={2000} value={draft.instructions ?? ''} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="x-media">Video o imagen (enlace https)</Label>
                <Input id="x-media" type="url" maxLength={500} value={draft.media_url ?? ''} onChange={(e) => setDraft({ ...draft, media_url: e.target.value })} className="h-10" />
              </div>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button type="submit" form="exercise" disabled={saving}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
