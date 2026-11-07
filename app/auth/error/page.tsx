import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth-shell'

export const metadata: Metadata = { title: 'Error de autenticación' }

export default function AuthErrorPage() {
  return (
    <AuthShell title="No pudimos validar el enlace" description="El enlace puede haber expirado o ya fue usado. Intentá ingresar nuevamente.">
      <Link href="/auth/login" className="text-sm font-medium underline underline-offset-4">
        Ir a ingresar
      </Link>
    </AuthShell>
  )
}
