'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { mutate } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/page-header'
import { UNREAD_KEY } from '@/components/notification-bell'
import { cn } from '@/lib/utils'

type Item = { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

export function NotificationsList({ items, timeZone }: { items: Item[]; timeZone: string }) {
  const router = useRouter()
  const unread = items.filter((n) => !n.read_at)
  const fmt = new Intl.DateTimeFormat('es-AR', { timeZone, dateStyle: 'medium', timeStyle: 'short' })

  async function markRead(ids: string[]) {
    if (ids.length === 0) return
    await createClient().from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    mutate(UNREAD_KEY)
    router.refresh()
  }

  if (items.length === 0) return <EmptyState title="Sin notificaciones" detail="Cuando haya novedades vas a verlas acá." />

  return (
    <div className="flex flex-col gap-3">
      {unread.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => markRead(unread.map((n) => n.id))}>
            Marcar todas como leídas
          </Button>
        </div>
      )}
      <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
        {items.map((n) => {
          const content = (
            <div className="flex items-start gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className={cn('text-sm', n.read_at ? 'text-muted-foreground' : 'font-semibold')}>
                  {n.title}
                  {!n.read_at && <span className="sr-only"> (sin leer)</span>}
                </p>
                {n.body && <p className="text-sm leading-relaxed text-muted-foreground">{n.body}</p>}
                <time dateTime={n.created_at} className="text-xs text-muted-foreground">
                  {fmt.format(new Date(n.created_at))}
                </time>
              </div>
            </div>
          )
          return (
            <li key={n.id}>
              {n.link ? (
                <Link href={n.link} onClick={() => !n.read_at && markRead([n.id])} className="block hover:bg-muted/50">
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={() => !n.read_at && markRead([n.id])} className="block w-full text-left hover:bg-muted/50">
                  {content}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
