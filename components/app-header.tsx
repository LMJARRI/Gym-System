'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABEL, type AppRole } from '@/lib/domain'
import { BrandMark } from '@/components/brand-mark'
import { NotificationBell } from '@/components/notification-bell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string }

function navFor(role: AppRole, teachersCanScan: boolean): NavItem[] {
  switch (role) {
    case 'student':
      return [
        { href: '/app/alumno', label: 'Inicio' },
        { href: '/app/alumno/rutinas', label: 'Rutinas' },
        { href: '/app/alumno/pagos', label: 'Pagos' },
        { href: '/app/alumno/progreso', label: 'Progreso' },
        { href: '/app/alumno/asistencia', label: 'Asistencia' },
      ]
    case 'staff':
      return [
        { href: '/app/acceso', label: 'Control de acceso' },
        { href: '/app/registros', label: 'Registros' },
      ]
    case 'teacher':
      return [
        { href: '/app/alumnos', label: 'Mis alumnos' },
        { href: '/app/rutinas', label: 'Rutinas' },
        { href: '/app/ejercicios', label: 'Ejercicios' },
        ...(teachersCanScan ? [{ href: '/app/acceso', label: 'Acceso' }] : []),
        { href: '/app/registros', label: 'Registros' },
      ]
    case 'owner':
      return [
        { href: '/app/resumen', label: 'Resumen' },
        { href: '/app/alumnos', label: 'Alumnos' },
        { href: '/app/pagos', label: 'Pagos' },
        { href: '/app/planes', label: 'Planes' },
        { href: '/app/rutinas', label: 'Rutinas' },
        { href: '/app/ejercicios', label: 'Ejercicios' },
        { href: '/app/acceso', label: 'Acceso' },
        { href: '/app/registros', label: 'Asistencia' },
        { href: '/app/gestion', label: 'Configuración' },
      ]
  }
}

function isActive(pathname: string, href: string) {
  if (href === '/app/alumno') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppHeader({
  role,
  gymName,
  userName,
  userId,
  teachersCanScan,
}: {
  role: AppRole
  gymName: string
  userName: string
  userId: string
  teachersCanScan: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    await createClient().auth.signOut()
    router.replace('/auth/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pt-3 md:px-6">
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
          <div className="flex items-center gap-1">
            <NotificationBell userId={userId} />
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/app/perfil" />}>
              <UserRound aria-hidden="true" />
              <span className="sr-only md:not-sr-only">Perfil</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut aria-hidden="true" />
              <span className="sr-only md:not-sr-only">Salir</span>
            </Button>
          </div>
        </div>
        <nav aria-label="Secciones" className="-mb-px flex gap-5 overflow-x-auto">
          {navFor(role, teachersCanScan).map((item) => {
            const active = isActive(pathname, item.href)
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
