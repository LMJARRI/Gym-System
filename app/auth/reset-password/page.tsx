import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '@/components/auth-shell'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export const metadata: Metadata = { title: 'Nueva contraseña' }
export const instant = false

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Without a session from the emailed link there is nothing to reset.
  if (!user) redirect('/auth/forgot-password')

  return (
    <AuthShell title="Elegí tu contraseña" description="Usá al menos 8 caracteres.">
      <ResetPasswordForm />
    </AuthShell>
  )
}
