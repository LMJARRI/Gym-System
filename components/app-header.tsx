'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABEL, type AppRole } from '@/lib/domain'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV: Record<AppRole, { href: string; label: string }[]> = {
  student: [
    { href: '/app/alumno', label: 'Credencial' },
    { href: '/app/alumno/asistencia', label: 'Mi asistencia' },
  ],
  staff: [{ href: '/app/acceso', label: 'Control de acceso' }],
  teacher: [
    { href: '/app/acceso', label: 'Control de acceso' },
    { href: '/app/registros', label: 'Registros' },
  ],
  owner: [
    { href: '/app/acceso', label: 'Acceso' },
    { href: '/app/registros', label: 'Registros' },
    { href: '/app/gestion', label: 'Gestión' },
  ],
}

export function AppHeader({ role, gymName, userName }: { role: AppRole; gymName: string; userName: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    await createClient().auth.signOut()
    router.replace('/auth/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pt-3 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark label={null} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold">{gymName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {userName || 'Sin nombre'} · {ROLE_LABEL[role]}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut aria-hidden="true" />
            <span className="sr-only md:not-sr-only">Salir</span>
          </Button>
        </div>
        <nav aria-label="Secciones" className="-mb-px flex gap-5 overflow-x-auto">
          {NAV[role].map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap border-b-2 pb-2.5 text-sm font-medium transition-colors',
                  active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
