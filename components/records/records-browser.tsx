'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { REASON_COPY, ROLE_LABEL, type AccessReason, type AppRole } from '@/lib/domain'
import { formatDateTime, todayIn } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type Filters = { from: string; to: string; studentId: string; scannerId: string; result: '' | 'granted' | 'denied' }
type EventRow = {
  id: string
  result: 'granted' | 'denied'
  reason: AccessReason
  occurred_at: string
  student: { full_name: string; member_number: number | null } | null
  scanner: { full_name: string; role: AppRole } | null
}
type Person = { id: string; full_name: string; role: AppRole; member_number: number | null }

const SELECT_CLASS =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function daysAgo(today: string, n: number) {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

async function fetchPeople([, gymId]: [string, string]): Promise<Person[]> {
  const { data, error } = await createClient()
    .from('profiles')
    .select('id, full_name, role, member_number')
    .eq('gym_id', gymId)
    .order('full_name')
  if (error) throw error
  return data
}

async function fetchEvents([, gymId, f]: [string, string, Filters]): Promise<EventRow[]> {
  let q = createClient()
    .from('access_events')
    .select(
      'id, result, reason, occurred_at, student:profiles!access_events_student_id_fkey(full_name, member_number), scanner:profiles!access_events_scanned_by_fkey(full_name, role)',
    )
    .eq('gym_id', gymId)
    .gte('local_date', f.from)
    .lte('local_date', f.to)
    .order('occurred_at', { ascending: false })
    .limit(500)
  if (f.studentId) q = q.eq('student_id', f.studentId)
  if (f.scannerId) q = q.eq('scanned_by', f.scannerId)
  if (f.result) q = q.eq('result', f.result)
  const { data, error } = await q.returns<EventRow[]>()
  if (error) throw error
  return data
}

async function fetchSummary([, gymId, f]: [string, string, Filters]) {
  let q = createClient()
    .from('attendance_days')
    .select('student_id, access_count, local_date')
    .eq('gym_id', gymId)
    .gte('local_date', f.from)
    .lte('local_date', f.to)
    .limit(5000)
  if (f.studentId) q = q.eq('student_id', f.studentId)
  const { data, error } = await q
  if (error) throw error
  const byStudent = new Map<string, { days: number; entries: number; last: string }>()
  for (const row of data) {
    const s = byStudent.get(row.student_id) ?? { days: 0, entries: 0, last: row.local_date }
    s.days += 1
    s.entries += row.access_count
    if (row.local_date > s.last) s.last = row.local_date
    byStudent.set(row.student_id, s)
  }
  return byStudent
}

export function RecordsBrowser({ gymId, timeZone, isOwner }: { gymId: string; timeZone: string; isOwner: boolean }) {
  const today = todayIn(timeZone)
  const [filters, setFilters] = useState<Filters>({ from: daysAgo(today, 6), to: today, studentId: '', scannerId: '', result: '' })
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))

  const people = useSWR(['people', gymId] as const, fetchPeople)
  const events = useSWR(['events', gymId, filters] as const, fetchEvents, { keepPreviousData: true })
  const summary = useSWR(['summary', gymId, filters] as const, fetchSummary, { keepPreviousData: true })

  const students = (people.data ?? []).filter((p) => p.role === 'student')
  const scanners = (people.data ?? []).filter((p) => p.role !== 'student')
  const nameOf = new Map((people.data ?? []).map((p) => [p.id, p]))

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Registros</h1>
        <p className="text-sm text-muted-foreground">
          {isOwner ? 'Todos los ingresos del gimnasio.' : 'Ingresos de tus alumnos asignados.'} Fechas en {timeZone.replaceAll('_', ' ')}.
        </p>
      </header>

      <form className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 md:grid-cols-5" onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">Desde</Label>
          <Input id="from" type="date" value={filters.from} max={filters.to} onChange={(e) => e.target.value && set({ from: e.target.value })} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">Hasta</Label>
          <Input id="to" type="date" value={filters.to} min={filters.from} onChange={(e) => e.target.value && set({ to: e.target.value })} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="student">Alumno</Label>
          <select id="student" className={SELECT_CLASS} value={filters.studentId} onChange={(e) => set({ studentId: e.target.value })}>
            <option value="">Todos</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || 'Sin nombre'}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scanner">Registrado por</Label>
          <select id="scanner" className={SELECT_CLASS} value={filters.scannerId} onChange={(e) => set({ scannerId: e.target.value })}>
            <option value="">Cualquiera</option>
            {scanners.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || 'Sin nombre'} ({ROLE_LABEL[s.role]})
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
          <Label htmlFor="result">Resultado</Label>
          <select id="result" className={SELECT_CLASS} value={filters.result} onChange={(e) => set({ result: e.target.value as Filters['result'] })}>
            <option value="">Todos</option>
            <option value="granted">Autorizados</option>
            <option value="denied">Rechazados</option>
          </select>
        </div>
      </form>

      <Tabs defaultValue="events" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="events">Ingresos</TabsTrigger>
          <TabsTrigger value="summary">Resumen por alumno</TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          {events.isLoading && !events.data ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : events.error ? (
            <p className="text-sm text-destructive">No pudimos cargar los registros.</p>
          ) : events.data && events.data.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-2xl border bg-card">
              {events.data.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-bold',
                      e.result === 'granted' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
                    )}
                  >
                    {e.result === 'granted' ? 'OK' : REASON_COPY[e.reason].title}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{e.student?.full_name ?? 'Código no identificado'}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.scanner ? `${e.scanner.full_name || 'Sin nombre'} · ` : ''}
                    <span className="font-mono">{formatDateTime(e.occurred_at, timeZone)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Sin registros para estos filtros.</p>
          )}
        </TabsContent>

        <TabsContent value="summary">
          {summary.isLoading && !summary.data ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : summary.data && summary.data.size > 0 ? (
            <ul className="flex flex-col divide-y rounded-2xl border bg-card">
              {[...summary.data.entries()]
                .sort((a, b) => b[1].days - a[1].days)
                .map(([id, s]) => (
                  <li key={id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{nameOf.get(id)?.full_name || 'Alumno'}</span>
                    <span className="font-mono text-muted-foreground">
                      {s.days} {s.days === 1 ? 'día' : 'días'} · {s.entries} ingresos
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Sin asistencias en el período.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
