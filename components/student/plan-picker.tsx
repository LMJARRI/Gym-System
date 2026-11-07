'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { formatDuration, formatMoney, rpcErrorMessage, type DurationUnit } from '@/lib/domain'
import { Button } from '@/components/ui/button'

export type PickerPlan = {
  id: string
  name: string
  description: string | null
  price: number
  duration_count: number
  duration_unit: DurationUnit
}

export function PlanPicker({ plans, currency, blockedReason, currentPlanId }: { plans: PickerPlan[]; currency: string; blockedReason: string | null; currentPlanId: string | null }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function choose(plan: PickerPlan) {
    const price = plan.price > 0 ? ` por ${formatMoney(plan.price, currency)}` : ''
    if (!window.confirm(`¿Elegir el plan ${plan.name}${price}?`)) return
    setBusyId(plan.id)
    const { error } = await createClient().rpc('student_select_plan', { p_plan: plan.id, p_request_id: crypto.randomUUID() })
    setBusyId(null)
    if (error) return toast.error(rpcErrorMessage(error, 'No se pudo elegir el plan'))
    toast.success(plan.price > 0 ? 'Plan elegido. Ahora completá el pago.' : 'Plan activado.')
    router.push('/app/alumno/pagos')
    router.refresh()
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {plans.map((p) => (
        <li key={p.id} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-bold">{p.name}</h3>
            {p.description ? <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{p.description}</p> : null}
          </div>
          <div className="mt-auto flex items-end justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-bold tabular-nums">{p.price > 0 ? formatMoney(p.price, currency) : 'Gratis'}</span>
              <span className="text-xs text-muted-foreground">{formatDuration(p.duration_count, p.duration_unit)}</span>
            </div>
            <Button onClick={() => choose(p)} disabled={!!blockedReason || busyId !== null}>
              {busyId === p.id ? 'Eligiendo…' : p.id === currentPlanId ? 'Renovar este plan' : 'Elegir'}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
