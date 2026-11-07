'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { AttendanceToday, Membership, Profile } from '@/lib/domain'
import { useMyAccessRealtime, type MyAccessEvent } from '@/hooks/use-my-access-realtime'
import { TodayCard } from '@/components/student/today-card'
import { CredentialCard } from '@/components/student/credential-card'
import { QrDialog } from '@/components/student/qr-dialog'

export const TODAY_KEY = 'attendance-today'

async function fetchToday(): Promise<AttendanceToday> {
  const { data, error } = await createClient().rpc('my_attendance_today')
  if (error) throw error
  return data as AttendanceToday
}

type Props = {
  profile: Profile
  gym: { name: string; timezone: string }
  membership: Membership | null
}

export function StudentDashboard({ profile, gym, membership }: Props) {
  const [qrOpen, setQrOpen] = useState(false)
  const [lastEvent, setLastEvent] = useState<MyAccessEvent | null>(null)

  // Polling covers midnight rollover and timezone changes; realtime covers scans.
  const today = useSWR(TODAY_KEY, fetchToday, { refreshInterval: 60_000, revalidateOnFocus: true })

  useMyAccessRealtime(profile.id, {
    onAccess: (event) => {
      setLastEvent(event)
      if (event.result === 'granted') today.mutate()
    },
    onAttendance: () => today.mutate(),
  })

  return (
    <div className="flex flex-col gap-5">
      <TodayCard data={today.data} isLoading={today.isLoading} hasError={Boolean(today.error)} />
      <CredentialCard profile={profile} gymName={gym.name} membership={membership} onShowQr={() => {
        setLastEvent(null)
        setQrOpen(true)
      }} />
      <QrDialog open={qrOpen} onOpenChange={setQrOpen} lastEvent={lastEvent} onRegenerate={() => setLastEvent(null)} timeZone={gym.timezone} />
    </div>
  )
}
