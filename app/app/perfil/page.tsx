import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { PageHeader } from '@/components/page-header'
import { ProfileForm } from '@/components/profile-form'

export const metadata: Metadata = { title: 'Mi perfil' }

export default async function ProfilePage() {
  const { profile } = await requireMember()
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="Mi perfil" description="Tus datos personales y foto para la credencial." />
      <ProfileForm profile={profile} />
    </div>
  )
}
