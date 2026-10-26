import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { GymSettingsForm } from '@/components/admin/gym-settings-form'
import { MembersManager } from '@/components/admin/members-manager'

export const metadata: Metadata = { title: 'Gestión' }

export default async function ManagementPage() {
  const { gym, profile } = await requireMember(['owner'])
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Gestión</h1>
        <p className="text-sm text-muted-foreground">
          Código para que los alumnos se unan: <span className="rounded-md bg-muted px-2 py-0.5 font-mono font-bold tracking-widest text-foreground">{gym.join_code}</span>
        </p>
      </header>
      <MembersManager gymId={gym.id} ownerId={profile.id} timeZone={gym.timezone} />
      <GymSettingsForm gym={gym} />
    </div>
  )
}
