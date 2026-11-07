'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ROUTINE_STATUS_LABEL, rpcErrorMessage, type RoutineStatus } from '@/lib/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/native-select'
import { SectionTitle } from '@/components/page-header'
import type { Exercise } from '@/components/routines/exercises-manager'
import type { PersonOption } from '@/components/routines/editor-data'

export type RoutineItem = {
  key: string
  exercise_id: string
  sets: number
  reps: string
  weight_kg: string
  rest_seconds: string
  duration_seconds: string
  distance_m: string
  notes: string
}

export type RoutineDraft = {
  id?: string
  student_id: string
  teacher_id: string
  name: string
  goal: string
  description: string
  starts_on: string
  ends_on: string
  status: RoutineStatus
  exercises: RoutineItem[]
}

function newItem(exerciseId = ''): RoutineItem {
  return { key: crypto.randomUUID(), exercise_id: exerciseId, sets: 3, reps: '10', weight_kg: '', rest_seconds: '60', duration_seconds: '', distance_m: '', notes: '' }
}

export function RoutineEditor({
  students,
  exercises,
  teachers,
  isOwner,
  initial,
}: {
  students: PersonOption[]
  exercises: Exercise[]
  teachers: PersonOption[]
  isOwner: boolean
  initial: RoutineDraft
}) {
  const router = useRouter()
  const [d, setD] = useState<RoutineDraft>(initial.exercises.length ? initial : { ...initial, exercises: [newItem()] })
  const [saving, setSaving] = useState(false)
  const activeExercises = exercises.filter((e) => e.status === 'active' || d.exercises.some((i) => i.exercise_id === e.id))
  const kindOf = (id: string) => exercises.find((e) => e.id === id)?.kind

  const set = <K extends keyof RoutineDraft>(k: K, v: RoutineDraft[K]) => setD((p) => ({ ...p, [k]: v }))
  const setItem = (key: string, patch: Partial<RoutineItem>) =>
    setD((p) => ({ ...p, exercises: p.exercises.map((i) => (i.key === key ? { ...i, ...patch } : i)) }))
  const move = (index: number, dir: -1 | 1) =>
    setD((p) => {
      const next = [...p.exercises]
      const target = index + dir
      if (target < 0 || target >= next.length) return p
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...p, exercises: next }
    })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!d.student_id) return toast.error('Elegí un alumno.')
    if (!d.name.trim()) return toast.error('Poné un nombre a la rutina.')
    const items = d.exercises.filter((i) => i.exercise_id)
    if (items.length === 0) return toast.error('Agregá al menos un ejercicio.')
    if (items.some((i) => !Number.isInteger(i.sets) || i.sets < 1 || i.sets > 50)) return toast.error('Las series deben estar entre 1 y 50.')
    if (d.ends_on && d.ends_on < d.starts_on) return toast.error('La fecha de fin es anterior al inicio.')

    setSaving(true)
    const { data, error } = await createClient().rpc('save_routine', {
      p_routine: d.id ?? null,
      p: {
        student_id: d.student_id,
        teacher_id: d.teacher_id || null,
        name: d.name.trim(),
        goal: d.goal,
        description: d.description,
        starts_on: d.starts_on,
        ends_on: d.ends_on,
        status: d.status,
        exercises: items.map((i) => ({
          exercise_id: i.exercise_id,
          sets: i.sets,
          reps: i.reps,
          weight_kg: i.weight_kg,
          rest_seconds: i.rest_seconds,
          duration_seconds: i.duration_seconds,
          distance_m: i.distance_m,
          notes: i.notes,
        })),
      },
    })
    setSaving(false)
    if (error) return toast.error(rpcErrorMessage(error, 'No se pudo guardar la rutina'))
    toast.success(d.id ? 'Rutina actualizada' : 'Rutina creada')
    router.push(`/app/rutinas/${data as string}`)
    router.refresh()
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-8">
      <section aria-labelledby="r-data" className="flex flex-col gap-3">
        <SectionTitle id="r-data">Datos</SectionTitle>
        <div className="grid gap-4 rounded-2xl border bg-card p-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="r-student">Alumno</Label>
            <NativeSelect id="r-student" required value={d.student_id} onChange={(e) => set('student_id', e.target.value)}>
              <option value="">Elegí un alumno…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name || 'Sin nombre'}{s.member_number != null ? ` (#${s.member_number})` : ''}</option>
              ))}
            </NativeSelect>
          </div>
          {isOwner && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="r-teacher">Profesor responsable</Label>
              <NativeSelect id="r-teacher" value={d.teacher_id} onChange={(e) => set('teacher_id', e.target.value)}>
                <option value="">Yo (dueño)</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </NativeSelect>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="r-name">Nombre</Label>
            <Input id="r-name" required maxLength={100} placeholder="Ej.: Fuerza tren inferior" value={d.name} onChange={(e) => set('name', e.target.value)} className="h-10" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="r-goal">Objetivo</Label>
            <Input id="r-goal" maxLength={200} value={d.goal} onChange={(e) => set('goal', e.target.value)} className="h-10" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="r-start">Inicio</Label>
            <Input id="r-start" type="date" required value={d.starts_on} onChange={(e) => set('starts_on', e.target.value)} className="h-10" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="r-end">Fin (opcional)</Label>
            <Input id="r-end" type="date" value={d.ends_on} onChange={(e) => set('ends_on', e.target.value)} className="h-10" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="r-status">Estado</Label>
            <NativeSelect id="r-status" value={d.status} onChange={(e) => set('status', e.target.value as RoutineStatus)}>
              {(Object.keys(ROUTINE_STATUS_LABEL) as RoutineStatus[]).map((s) => <option key={s} value={s}>{ROUTINE_STATUS_LABEL[s]}</option>)}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">Los borradores no los ve el alumno.</p>
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="r-desc">Indicaciones generales</Label>
            <Textarea id="r-desc" maxLength={1000} value={d.description} onChange={(e) => set('description', e.target.value)} />
          </div>
        </div>
      </section>

      <section aria-labelledby="r-ex" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionTitle id="r-ex">Ejercicios ({d.exercises.length})</SectionTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => set('exercises', [...d.exercises, newItem()])} disabled={d.exercises.length >= 100}>
            <Plus aria-hidden="true" />
            Agregar
          </Button>
        </div>
        {activeExercises.length === 0 && (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">No hay ejercicios en la biblioteca. Creá algunos en Ejercicios.</p>
        )}
        <ol className="flex flex-col gap-3">
          {d.exercises.map((item, index) => {
            const cardio = kindOf(item.exercise_id) === 'cardio'
            return (
              <li key={item.key} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-bold">{index + 1}</span>
                  <NativeSelect aria-label={`Ejercicio ${index + 1}`} className="flex-1" value={item.exercise_id} onChange={(e) => setItem(item.key, { exercise_id: e.target.value })}>
                    <option value="">Elegí un ejercicio…</option>
                    {activeExercises.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.muscle_group}</option>)}
                  </NativeSelect>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Subir" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Bajar" disabled={index === d.exercises.length - 1} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => set('exercises', d.exercises.filter((i) => i.key !== item.key))}><Trash2 aria-hidden="true" /></Button>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`s-${item.key}`} className="text-xs">Series</Label>
                    <Input id={`s-${item.key}`} type="number" min={1} max={50} value={item.sets} onChange={(e) => setItem(item.key, { sets: Number(e.target.value) })} className="h-9 font-mono" />
                  </div>
                  {cardio ? (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`du-${item.key}`} className="text-xs">Duración (seg)</Label>
                        <Input id={`du-${item.key}`} type="number" min={0} value={item.duration_seconds} onChange={(e) => setItem(item.key, { duration_seconds: e.target.value })} className="h-9 font-mono" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`di-${item.key}`} className="text-xs">Distancia (m)</Label>
                        <Input id={`di-${item.key}`} type="number" min={0} value={item.distance_m} onChange={(e) => setItem(item.key, { distance_m: e.target.value })} className="h-9 font-mono" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`r-${item.key}`} className="text-xs">Repeticiones</Label>
                        <Input id={`r-${item.key}`} maxLength={20} placeholder="10 o 8-12" value={item.reps} onChange={(e) => setItem(item.key, { reps: e.target.value })} className="h-9 font-mono" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`w-${item.key}`} className="text-xs">Peso (kg)</Label>
                        <Input id={`w-${item.key}`} type="number" min={0} max={1000} step="0.5" value={item.weight_kg} onChange={(e) => setItem(item.key, { weight_kg: e.target.value })} className="h-9 font-mono" />
                      </div>
                    </>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`rest-${item.key}`} className="text-xs">Descanso (seg)</Label>
                    <Input id={`rest-${item.key}`} type="number" min={0} max={3600} value={item.rest_seconds} onChange={(e) => setItem(item.key, { rest_seconds: e.target.value })} className="h-9 font-mono" />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
                    <Label htmlFor={`n-${item.key}`} className="text-xs">Nota</Label>
                    <Input id={`n-${item.key}`} maxLength={300} value={item.notes} onChange={(e) => setItem(item.key, { notes: e.target.value })} className="h-9" />
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : d.id ? 'Guardar nueva versión' : 'Crear rutina'}</Button>
      </div>
    </form>
  )
}
