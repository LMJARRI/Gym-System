import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth-shell'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata: Metadata = { title: 'Recuperar contraseña' }

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Recuperar contraseña" description="Te enviamos un enlace por email para que elijas una contraseña nueva.">
      <ForgotPasswordForm />
    </AuthShell>
  )
}
