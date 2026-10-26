'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Gym } from '@/lib/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { TimezoneSelect } from '@/components/timezone-select'

export function GymSettingsForm({ gym }: { gym: Gym }) {
  const router = useRouter()
  const [timezone, setTimezone] = useState(gym.timezone)
  const [ttl, setTtl] = useState(gym.qr_ttl_seconds)
  const [allowPending, setAllowPending] = useState(gym.allow_pending_payment)
  const [grace, setGrace] = useState(gym.pending_grace_days)
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await createClient().rpc('owner_update_gym', {
      p_timezone: timezone,
      p_qr_ttl_seconds: ttl,
      p_allow_pending_payment: allowPending,
      p_pending_grace_days: grace,
    })
    setSaving(false)
    if (error) {
      toast.error('No se pudo guardar la configuración')
      return
    }
    toast.success('Configuración guardada')
    router.refresh()
  }

  return (
    <section aria-labelledby="settings-title" className="flex flex-col gap-3">
      <h2 id="settings-title" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Reglas de acceso
      </h2>
      <form onSubmit={save} className="grid gap-5 rounded-2xl border bg-card p-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tz">Zona horaria del gimnasio</Label>
          <TimezoneSelect id="tz" value={timezone} onChange={setTimezone} />
          <p className="text-xs leading-relaxed text-muted-foreground">Define cuándo empieza y termina cada día de asistencia.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ttl">Vigencia del QR (segundos)</Label>
          <Input id="ttl" type="number" min={10} max={300} required value={ttl} onChange={(e) => setTtl(Number(e.target.value))} className="h-10 font-mono" />
          <p className="text-xs leading-relaxed text-muted-foreground">Entre 10 y 300. Recomendado: 30.</p>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pending">Permitir ingreso con pago pendiente</Label>
            <p className="text-xs leading-relaxed text-muted-foreground">Si está apagado, solo ingresan membresías activas.</p>
          </div>
          <Switch id="pending" checked={allowPending} onCheckedChange={setAllowPending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="grace">Días de gracia tras el vencimiento (pago pendiente)</Label>
          <Input
            id="grace"
            type="number"
            min={0}
            max={60}
            required
            disabled={!allowPending}
            value={grace}
            onChange={(e) => setGrace(Number(e.target.value))}
            className="h-10 font-mono"
          />
        </div>
        <div className="md:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar reglas'}
          </Button>
        </div>
      </form>
    </section>
  )
}
