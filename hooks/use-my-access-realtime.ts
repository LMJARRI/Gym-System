'use client'

import { useEffect, useEffectEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { AccessReason } from '@/lib/domain'

export type MyAccessEvent = { id: string; result: 'granted' | 'denied'; reason: AccessReason; occurred_at: string }

/**
 * Listens to the signed-in student's own access events and attendance rows.
 * RLS on both tables limits the stream to that student.
 */
export function useMyAccessRealtime(userId: string, handlers: { onAccess?: (e: MyAccessEvent) => void; onAttendance?: () => void }) {
  const onAccess = useEffectEvent((e: MyAccessEvent) => handlers.onAccess?.(e))
  const onAttendance = useEffectEvent(() => handlers.onAttendance?.())

  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false

    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) await supabase.realtime.setAuth(data.session.access_token)
      if (cancelled) return
      channel = supabase
        .channel(`student-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'access_events', filter: `student_id=eq.${userId}` }, (payload) =>
          onAccess(payload.new as MyAccessEvent),
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_days', filter: `student_id=eq.${userId}` }, () =>
          onAttendance(),
        )
        .subscribe()
    })()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [userId])
}
