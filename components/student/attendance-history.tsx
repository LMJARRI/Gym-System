'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatLocalDate, formatTime, todayIn } from '@/lib/format'
import { useMyAccessRealtime } from '@/hooks/use-my-access-realtime'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Day = { local_date: string; first_access_at: string; last_access_at: string; access_count: number }
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function monthBounds(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return { from: `${year}-${pad(month + 1)}-01`, to: `${year}-${pad(month + 1)}-${pad(daysInMonth)}`, daysInMonth }
}

async function fetchMonth([, studentId, from, to]: [string, string, string, string]): Promise<Day[]> {
  const { data, error } = await createClient()
    .from('attendance_days')
    .select('local_date, first_access_at, last_access_at, access_count')
    .eq('student_id', studentId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: false })
  if (error) throw error
  return data
}

export function AttendanceHistory({ studentId, timeZone }: { studentId: string; timeZone: string }) {
  const today = todayIn(timeZone)
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }))
  const { from, to, daysInMonth } = monthBounds(cursor.year, cursor.month)
  const isCurrentMonth = today.startsWith(from.slice(0, 7))

  const { data, error, isLoading, mutate } = useSWR(['attendance-month', studentId, from, to] as const, fetchMonth, {
    keepPreviousData: true,
  })
  useMyAccessRealtime(studentId, { onAttendance: () => mutate() })

  const byDate = new Map((data ?? []).map((d) => [d.local_date, d]))
  const totalEntries = (data ?? []).reduce((sum, d) => sum + d.access_count, 0)
  const firstWeekday = (new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay() + 6) % 7

  function shift(delta: number) {
    setCursor(({ year, month }) => {
      const m = month + delta
      return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight capitalize">
          {formatLocalDate(from, { month: 'long', year: 'numeric' })}
        </h1>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={() => shift(-1)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Mes siguiente" disabled={isCurrentMonth} onClick={() => shift(1)}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Días asistidos</dt>
          <dd className="font-mono text-3xl font-bold">{data ? data.length : '–'}</dd>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Ingresos</dt>
          <dd className="font-mono text-3xl font-bold">{data ? totalEntries : '–'}</dd>
        </div>
      </dl>

      <section aria-label="Calendario del mes" className="rounded-2xl border bg-card p-4">
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAYS.map((d, i) => (
            <span key={i} aria-hidden="true" className="pb-1 text-xs font-medium text-muted-foreground">
              {d}
            </span>
          ))}
          {Array.from({ length: firstWeekday }, (_, i) => (
            <span key={`pad-${i}`} aria-hidden="true" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const date = `${from.slice(0, 8)}${String(i + 1).padStart(2, '0')}`
            const attended = byDate.has(date)
            return (
              <span
                key={date}
                title={attended ? 'Asististe' : undefined}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg font-mono text-sm',
                  attended ? 'bg-success font-bold text-success-foreground' : 'text-muted-foreground',
                  date === today && !attended && 'ring-2 ring-primary',
                  date > today && 'opacity-40',
                )}
              >
                <span className="sr-only">{attended ? 'Asististe el ' : ''}</span>
                {i + 1}
              </span>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="entries-title" className="flex flex-col gap-2">
        <h2 id="entries-title" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Historial
        </h2>
        {isLoading && !data ? (
          <Skeleton className="h-32 w-full rounded-2xl" />
        ) : error ? (
          <p className="text-sm text-destructive">No pudimos cargar tu historial.</p>
        ) : data && data.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-2xl border bg-card">
            {data.map((d) => (
              <li key={d.local_date} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-medium capitalize">{formatLocalDate(d.local_date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="font-mono text-muted-foreground">
                  {formatTime(d.first_access_at, timeZone)}
                  {d.access_count > 1 ? ` · ${d.access_count} ingresos` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Sin asistencias este mes.</p>
        )}
      </section>
    </div>
  )
}
