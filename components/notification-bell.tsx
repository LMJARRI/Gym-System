'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import useSWR from 'swr'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export const UNREAD_KEY = 'notifications:unread'

async function fetchUnread() {
  const { count, error } = await createClient()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export function NotificationBell({ userId }: { userId: string }) {
  const { data: unread = 0, mutate } = useSWR(UNREAD_KEY, fetchUnread, { refreshInterval: 60_000 })

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => mutate())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, mutate])

  return (
    <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/app/notificaciones" />} className="relative">
      <Bell aria-hidden="true" />
      <span className="sr-only">{unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}</span>
      {unread > 0 && (
        <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold text-primary-foreground">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Button>
  )
}
