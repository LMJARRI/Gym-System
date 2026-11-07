'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { rpcErrorMessage, type Gym } from '@/lib/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { TimezoneSelect } from '@/components/timezone-select'
import { SectionTitle } from '@/components/page-header'

function Field({ id, label, hint, children, wide }: { id: string; label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'flex flex-col gap-2 md:col-span-2' : 'flex flex-col gap-2'}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function GymSettingsForm({ gym }: { gym: Gym }) {
  const router = useRouter()
  const [s, setS] = useState({
    name: gym.name,
    address: gym.address ?? '',
    phone: gym.phone ?? '',
    contact_email: gym.contact_email ?? '',
    opening_hours: gym.opening_hours ?? '',
    welcome_message: gym.welcome_message ?? '',
    currency: gym.currency,
    transfer_instructions: gym.transfer_instructions ?? '',
    timezone: gym.timezone,
    day_cutoff_hour: gym.day_cutoff_hour,
    qr_ttl_seconds: gym.qr_ttl_seconds,
    allow_pending_payment: gym.allow_pending_payment,
    pending_grace_days: gym.pending_grace_days,
    expiry_notice_days: gym.expiry_notice_days,
    renewal_policy: gym.renewal_policy,
    teachers_can_scan: gym.teachers_can_scan,
  })
  const [logoUrl, setLogoUrl] = useState(gym.logo_url)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((prev) => ({ ...prev, [k]: v }))

  async function uploadLogo(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      return toast.error('Usá una imagen JPG, PNG o WebP de hasta 2 MB.')
    }
    const supabase = createClient()
    const path = `logos/${gym.id}/${crypto.randomUUID()}.${file.type.split('/')[1]}`
    const { error } = await supabase.storage.from('public-media').upload(path, file, { contentType: file.type })
    if (error) return toast.error('No se pudo subir el logo.')
    const url = supabase.storage.from('public-media').getPublicUrl(path).data.publicUrl
    const { error: e2 } = await supabase.rpc('owner_update_gym_settings', { p: { logo_url: url } })
    if (e2) return toast.error(rpcErrorMessage(e2))
    setLogoUrl(url)
    toast.success('Logo actualizado')
    router.refresh()
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (s.name.trim().length < 2) return toast.error('Ingresá el nombre del gimnasio.')
    if (!/^[A-Za-z]{3}$/.test(s.currency)) return toast.error('La moneda debe ser un código de 3 letras (ej. ARS).')
    setSaving(true)
    const { error } = await createClient().rpc('owner_update_gym_settings', { p: s })
    setSaving(false)
    if (error) return toast.error(rpcErrorMessage(error, 'No se pudo guardar la configuración'))
    toast.success('Configuración guardada')
    router.refresh()
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-8">
      <section aria-labelledby="gym-data" className="flex flex-col gap-3">
        <SectionTitle id="gym-data">Datos del gimnasio</SectionTitle>
        <div className="grid gap-5 rounded-2xl border bg-card p-5 md:grid-cols-2">
          <Field id="g-name" label="Nombre">
            <Input id="g-name" required maxLength={120} value={s.name} onChange={(e) => set('name', e.target.value)} className="h-10" />
          </Field>
          <Field id="g-logo" label="Logo" hint={logoUrl ? 'Logo cargado. Subí otro para reemplazarlo.' : 'JPG, PNG o WebP, hasta 2 MB.'}>
            <Input id="g-logo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }} className="h-10" />
          </Field>
          <Field id="g-address" label="Dirección">
            <Input id="g-address" maxLength={200} value={s.address} onChange={(e) => set('address', e.target.value)} className="h-10" />
          </Field>
          <Field id="g-phone" label="Teléfono">
            <Input id="g-phone" type="tel" maxLength={40} value={s.phone} onChange={(e) => set('phone', e.target.value)} className="h-10" />
          </Field>
          <Field id="g-email" label="Email de contacto">
            <Input id="g-email" type="email" maxLength={254} value={s.contact_email} onChange={(e) => set('contact_email', e.target.value)} className="h-10" />
          </Field>
          <Field id="g-hours" label="Horarios">
            <Input id="g-hours" maxLength={300} placeholder="Lun a Vie 7 a 22 · Sáb 9 a 14" value={s.opening_hours} onChange={(e) => set('opening_hours', e.target.value)} className="h-10" />
          </Field>
          <Field id="g-welcome" label="Mensaje de bienvenida" hint="Se muestra en el inicio de los alumnos." wide>
            <Textarea id="g-welcome" maxLength={500} value={s.welcome_message} onChange={(e) => set('welcome_message', e.target.value)} />
          </Field>
        </div>
      </section>

      <section aria-labelledby="gym-payments" className="flex flex-col gap-3">
        <SectionTitle id="gym-payments">Pagos y membresías</SectionTitle>
        <div className="grid gap-5 rounded-2xl border bg-card p-5 md:grid-cols-2">
          <Field id="g-currency" label="Moneda" hint="Código ISO de 3 letras.">
            <Input id="g-currency" maxLength={3} value={s.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} className="h-10 font-mono uppercase" />
          </Field>
          <Field id="g-notice" label="Avisar vencimiento con (días)" hint="Entre 0 y 30.">
            <Input id="g-notice" type="number" min={0} max={30} value={s.expiry_notice_days} onChange={(e) => set('expiry_notice_days', Number(e.target.value))} className="h-10 font-mono" />
          </Field>
          <Field id="g-transfer" label="Datos para transferencia" hint="Alias, CBU o instrucciones que ven los alumnos al pagar." wide>
            <Textarea id="g-transfer" maxLength={1000} value={s.transfer_instructions} onChange={(e) => set('transfer_instructions', e.target.value)} />
          </Field>
          <div className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm font-medium">Al renovar, el nuevo período empieza</span>
            <div role="radiogroup" aria-label="Política de renovación" className="flex flex-wrap gap-2">
              {([['from_end', 'Al terminar el período actual'], ['from_today', 'Desde la fecha de renovación']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={s.renewal_policy === value}
                  onClick={() => set('renewal_policy', value)}
                  className={`rounded-lg border px-3 py-2 text-sm ${s.renewal_policy === value ? 'border-primary bg-primary/10 font-semibold' : 'text-muted-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="gym-access" className="flex flex-col gap-3">
        <SectionTitle id="gym-access">Reglas de acceso</SectionTitle>
        <div className="grid gap-5 rounded-2xl border bg-card p-5 md:grid-cols-2">
          <Field id="tz" label="Zona horaria" hint="Define cuándo empieza y termina cada día de asistencia.">
            <TimezoneSelect id="tz" value={s.timezone} onChange={(v) => set('timezone', v)} />
          </Field>
          <Field id="g-cutoff" label="Hora de corte del día" hint="0 a 6. Con 3, un ingreso a las 2 AM cuenta para el día anterior.">
            <Input id="g-cutoff" type="number" min={0} max={6} value={s.day_cutoff_hour} onChange={(e) => set('day_cutoff_hour', Number(e.target.value))} className="h-10 font-mono" />
          </Field>
          <Field id="ttl" label="Vigencia del QR (segundos)" hint="Entre 10 y 300. Recomendado: 30.">
            <Input id="ttl" type="number" min={10} max={300} required value={s.qr_ttl_seconds} onChange={(e) => set('qr_ttl_seconds', Number(e.target.value))} className="h-10 font-mono" />
          </Field>
          <Field id="grace" label="Días de gracia con pago pendiente">
            <Input id="grace" type="number" min={0} max={60} value={s.pending_grace_days} disabled={!s.allow_pending_payment} onChange={(e) => set('pending_grace_days', Number(e.target.value))} className="h-10 font-mono" />
          </Field>
          <Toggle id="pending" label="Permitir ingreso con pago pendiente" hint="Si está apagado, solo ingresan membresías activas." checked={s.allow_pending_payment} onChange={(v) => set('allow_pending_payment', v)} />
          <Toggle id="tscan" label="Profesores pueden registrar ingresos" hint="Solo de sus alumnos asignados." checked={s.teachers_can_scan} onChange={(v) => set('teachers_can_scan', v)} />
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar configuración'}
        </Button>
      </div>
    </form>
  )
}
