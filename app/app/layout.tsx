import { requireMember } from '@/lib/session'
import { AppHeader } from '@/components/app-header'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, gym } = await requireMember()

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader role={profile.role} gymName={gym.name} userName={profile.full_name} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">{children}</main>
    </div>
  )
}
