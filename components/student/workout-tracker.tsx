'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type WorkoutSet = {
  id: string
  exercise_name: string
  position: number
  set_number: number
  planned_reps: string | null
  planned_weight_kg: number | null
  reps: number | null
  weight_kg: number | null
  duration_seconds: number | null
  distance_m: number | null
  completed: boolean
}

export function WorkoutTracker({ workoutId, status, initialSets }: { workoutId: string; status: 'in_progress' | 'completed' | 'abandoned'; initialSets: WorkoutSet[] }) {
  const router = useRouter()
  const [sets, setSets] = useState(initialSets)
  const [finishing, setFinishing] = useState(false)
  const editable = status === 'in_progress'
  const done = sets.filter((s) => s.completed).length

  const groups: Array<{ position: number; name: string; items: WorkoutSet[] }> = []
  for (const s of sets) {
    const last = groups[groups.length - 1]
    if (last && last.position === s.position) last.items.push(s)
    else groups.push({ position: s.position, name: s.exercise_name, items: [s] })
  }

  async function update(id: string, patch: Partial<WorkoutSet>) {
    const before = sets
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    const { error } = await createClient().from('workout_sets').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      setSets(before)
      toast.error('No se pudo guardar la serie.')
    }
  }

  function numberOrNull(v: string, max: number) {
    if (v === '') return null
    const n = Number(v)
    return n >= 0 && n <= max ? n : undefined
  }

  async function finish(nextStatus: 'completed' | 'abandoned') {
    setFinishing(true)
    const { error } = await createClient().from('workouts').update({ status: nextStatus, finished_at: new Date().toISOString() }).eq('id', workoutId)
    setFinishing(false)
    if (error) return toast.error('No se pudo cerrar el entrenamiento.')
    toast.success(nextStatus === 'completed' ? `Entrenamiento completado: ${done} de ${sets.length} series` : 'Entrenamiento abandonado')
    router.push('/app/alumno/progreso')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">Progreso</span>
          <span className="font-mono tabular-nums">{done}/{sets.length} series</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={sets.length} aria-valuenow={done} aria-label="Series completadas">
          <div className="h-full bg-success transition-all" style={{ width: `${sets.length ? (done / sets.length) * 100 : 0}%` }} />
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.position} aria-label={g.name} className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
          <h2 className="font-bold">
            <span className="mr-2 font-mono text-xs text-muted-foreground">{g.position}</span>
            {g.name}
          </h2>
          <ul className="flex flex-col gap-2">
            {g.items.map((s) => (
              <li key={s.id} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2', s.completed && 'border-success/40 bg-success/10')}>
                <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">Serie {s.set_number}</span>
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    aria-label={`Repeticiones serie ${s.set_number}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1000}
                    placeholder={s.planned_reps ?? 'reps'}
                    disabled={!editable}
                    defaultValue={s.reps ?? ''}
                    onBlur={(e) => {
                      const v = numberOrNull(e.target.value, 1000)
                      if (v !== undefined && v !== s.reps) update(s.id, { reps: v })
                    }}
                    className="h-9 w-20 font-mono"
                  />
                  <span className="text-xs text-muted-foreground">reps</span>
                  <Input
                    aria-label={`Peso serie ${s.set_number}`}
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min={0}
                    max={1000}
                    placeholder={s.planned_weight_kg != null ? String(s.planned_weight_kg) : 'kg'}
                    disabled={!editable}
                    defaultValue={s.weight_kg ?? ''}
                    onBlur={(e) => {
                      const v = numberOrNull(e.target.value, 1000)
                      if (v !== undefined && v !== s.weight_kg) update(s.id, { weight_kg: v })
                    }}
                    className="h-9 w-20 font-mono"
                  />
                  <span className="text-xs text-muted-foreground">kg</span>
                </div>
                <Button
                  size="icon"
                  variant={s.completed ? 'default' : 'outline'}
                  aria-label={s.completed ? `Desmarcar serie ${s.set_number}` : `Completar serie ${s.set_number}`}
                  aria-pressed={s.completed}
                  disabled={!editable}
                  onClick={() => update(s.id, { completed: !s.completed })}
                  className={cn(s.completed && 'bg-success text-success-foreground hover:bg-success/90')}
                >
                  <Check aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editable && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={finishing} onClick={() => finish('abandoned')}>Abandonar</Button>
          <Button disabled={finishing} onClick={() => finish('completed')}>Finalizar entrenamiento</Button>
        </div>
      )}
    </div>
  )
}
