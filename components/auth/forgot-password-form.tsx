'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim()
    setIsLoading(true)
    setError(null)
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    })
    setIsLoading(false)
    // Same answer whether or not the email exists, so this form can't be used to probe accounts.
    if (error && (error.status === 429 || error.code === 'over_email_send_rate_limit')) {
      setError('Demasiados intentos. Esperá unos minutos y probá de nuevo.')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm leading-relaxed">
          Si el email corresponde a una cuenta, te llegará un enlace para restablecer la contraseña. Revisá también la carpeta de spam.
        </p>
        <Link href="/auth/login" className="text-center text-sm font-medium underline underline-offset-4">
          Volver a ingresar
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-10 w-full" disabled={isLoading}>
        {isLoading ? 'Enviando…' : 'Enviar enlace'}
      </Button>
      <Link href="/auth/login" className="text-center text-sm text-muted-foreground underline underline-offset-4">
        Volver a ingresar
      </Link>
    </form>
  )
}
