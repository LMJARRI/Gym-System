import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth-shell'
import { SignUpForm } from '@/components/auth/sign-up-form'

export const metadata: Metadata = { title: 'Crear cuenta' }

export default function SignUpPage() {
  return (
    <AuthShell
      title="Crear cuenta"
      description="Después de confirmar tu email vas a poder unirte a tu gimnasio con su código o crear uno nuevo."
    >
      <SignUpForm />
    </AuthShell>
  )
}
