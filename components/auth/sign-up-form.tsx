'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function signUpErrorMessage(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: string; status?: number }
  if (code === 'weak_password') return 'La contraseña es muy débil. Usá al menos 8 caracteres.'
  if (code === 'email_address_invalid') return 'Ingresá un email válido.'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) {
    return 'Demasiados intentos. Esperá un momento.'
  }
  // Never confirm whether the email is already registered.
  if (code === 'user_already_exists' || code === 'email_exists') return 'No pudimos crear la cuenta con esos datos.'
  return 'Ocurrió un error inesperado. Intentá de nuevo.'
}

export function SignUpForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password'))
    if (password !== String(form.get('repeat'))) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setIsLoading(true)
    setError(null)
    const { error } = await createClient().auth.signUp({
      email: String(form.get('email')),
      password,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
        data: { full_name: String(form.get('full_name')).trim().slice(0, 120) },
      },
    })
    if (error) {
      setError(signUpErrorMessage(error))
      setIsLoading(false)
      return
    }
    router.push('/auth/sign-up-success')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="full_name">Nombre y apellido</Label>
        <Input id="full_name" name="full_name" autoComplete="name" required maxLength={120} className="h-10" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="h-10" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="repeat">Repetir contraseña</Label>
        <Input id="repeat" name="repeat" type="password" autoComplete="new-password" minLength={8} required className="h-10" />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-10 w-full" disabled={isLoading}>
        {isLoading ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {'¿Ya tenés cuenta? '}
        <Link href="/auth/login" className="font-medium text-foreground underline underline-offset-4">
          Ingresá
        </Link>
      </p>
    </form>
  )
}
