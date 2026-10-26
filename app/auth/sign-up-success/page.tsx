import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth-shell'

export const metadata: Metadata = { title: 'Revisá tu email' }

export default function SignUpSuccessPage() {
  return (
    <AuthShell title="Revisá tu email" description="Te enviamos un enlace para confirmar tu cuenta. Abrilo desde este dispositivo para continuar.">
      <Link href="/auth/login" className="text-sm font-medium underline underline-offset-4">
        Volver a ingresar
      </Link>
    </AuthShell>
  )
}
