import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Cuenta inactiva' }

export default function InactiveAccountPage() {
  return (
    <AuthShell
      title="Tu cuenta está inactiva"
      description="El gimnasio desactivó tu acceso. Tus datos e historial se conservan. Contactá a la administración para reactivarla."
    >
      <Button variant="outline" nativeButton={false} render={<Link href="/auth/login" />}>
        Volver al inicio de sesión
      </Button>
    </AuthShell>
  )
}
