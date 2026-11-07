import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { PageHeader } from '@/components/page-header'
import { NotificationsList } from '@/components/notifications-list'

export const metadata: Metadata = { title: 'Notificaciones' }

export default async function NotificationsPage() {
  const { supabase, gym } = await requireMember()
  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, link, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Notificaciones" description="Avisos de pagos, membresías y rutinas." />
      <NotificationsList items={data ?? []} timeZone={gym.timezone} />
    </div>
  )
}
