'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ResetPasswordForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password') ?? '')
    const confirm = String(form.get('confirm') ?? '')
    if (password.length < 8 || password.length > 72) return setError('La contraseña debe tener entre 8 y 72 caracteres.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    setIsLoading(true)
    setError(null)
    const { error } = await createClient().auth.updateUser({ password })
    if (error) {
      setError(
        error.code === 'same_password'
          ? 'La nueva contraseña debe ser distinta de la anterior.'
          : error.code === 'weak_password'
            ? 'La contraseña es demasiado débil.'
            : 'No se pudo actualizar la contraseña. Pedí un enlace nuevo e intentá de nuevo.',
      )
      setIsLoading(false)
      return
    }
    router.replace('/app')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña nueva</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required className="h-10" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Repetí la contraseña</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required className="h-10" />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-10 w-full" disabled={isLoading}>
        {isLoading ? 'Guardando…' : 'Guardar contraseña'}
      </Button>
    </form>
  )
}
