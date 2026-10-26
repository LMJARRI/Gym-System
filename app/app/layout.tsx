import { Suspense } from 'react'
import { requireMember } from '@/lib/session'
import { AppHeader } from '@/components/app-header'

async function MemberShell({ children }: { children: React.ReactNode }) {
  const { profile, gym } = await requireMember()

  return (
    <>
      <AppHeader role={profile.role} gymName={gym.name} userName={profile.full_name} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">{children}</main>
    </>
  )
}

function ShellFallback() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:px-6" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="h-10 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-48 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <Suspense fallback={<ShellFallback />}>
        <MemberShell>{children}</MemberShell>
      </Suspense>
    </div>
  )
}
