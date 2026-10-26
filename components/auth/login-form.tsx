'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Only the credential/existence signal is genericized; actionable errors pass through.
function loginErrorMessage(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: string; status?: number }
  if (code === 'email_not_confirmed') return 'Confirmá tu email: revisá tu bandeja de entrada.'
  if (code === 'over_request_rate_limit' || status === 429) return 'Demasiados intentos. Esperá un momento.'
  if (code === 'invalid_credentials') return 'Email o contraseña incorrectos.'
  return 'Ocurrió un error inesperado. Intentá de nuevo.'
}

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setIsLoading(true)
    setError(null)
    const { error } = await createClient().auth.signInWithPassword({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })
    if (error) {
      setError(loginErrorMessage(error))
      setIsLoading(false)
      return
    }
    router.replace('/app')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-10 w-full" disabled={isLoading}>
        {isLoading ? 'Ingresando…' : 'Ingresar'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {'¿No tenés cuenta? '}
        <Link href="/auth/sign-up" className="font-medium text-foreground underline underline-offset-4">
          Registrate
        </Link>
      </p>
    </form>
  )
}
