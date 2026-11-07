'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TimezoneSelect } from '@/components/timezone-select'

const ERRORS: Record<string, string> = {
  invalid_code: 'Ese código no corresponde a ningún gimnasio.',
  already_in_gym: 'Tu cuenta ya pertenece a un gimnasio.',
  invalid_timezone: 'Elegí una zona horaria válida.',
}

function rpcError(message: string) {
  return Object.entries(ERRORS).find(([key]) => message.includes(key))?.[1] ?? 'Ocurrió un error. Intentá de nuevo.'
}

export function OnboardingForms() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)

  async function run(call: () => PromiseLike<{ error: { message: string } | null }>) {
    setPending(true)
    setError(null)
    const { error } = await call()
    if (error) {
      setError(rpcError(error.message))
      setPending(false)
      return
    }
    router.replace('/app')
    router.refresh()
  }

  return (
    <Tabs defaultValue="join" className="flex flex-col gap-5">
      <TabsList className="w-full">
        <TabsTrigger value="join">Tengo un código</TabsTrigger>
        <TabsTrigger value="create">Crear gimnasio</TabsTrigger>
      </TabsList>

      <TabsContent value="join">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            const code = String(new FormData(e.currentTarget).get('code'))
            run(() => createClient().rpc('join_gym', { p_code: code }))
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">Código del gimnasio</Label>
            <Input id="code" name="code" required maxLength={20} autoComplete="off" className="h-10 font-mono uppercase tracking-widest" />
          </div>
          <Button type="submit" size="lg" className="h-10" disabled={pending}>
            {pending ? 'Uniéndote…' : 'Unirme como alumno'}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="create">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            const name = String(new FormData(e.currentTarget).get('name')).trim()
            run(() => createClient().rpc('create_gym', { p_name: name, p_timezone: timezone }))
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nombre del gimnasio</Label>
            <Input id="name" name="name" required minLength={2} maxLength={120} className="h-10" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="timezone">Zona horaria</Label>
            <TimezoneSelect id="timezone" value={timezone} onChange={setTimezone} />
          </div>
          <Button type="submit" size="lg" className="h-10" disabled={pending}>
            {pending ? 'Creando…' : 'Crear y ser dueño'}
          </Button>
        </form>
      </TabsContent>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Tabs>
  )
}
