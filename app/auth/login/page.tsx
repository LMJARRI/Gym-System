import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth-shell'
import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = { title: 'Ingresar' }

export default function LoginPage() {
  return (
    <AuthShell title="Ingresar" description="Accedé a tu credencial o al control de acceso del gimnasio.">
      <LoginForm />
    </AuthShell>
  )
}
