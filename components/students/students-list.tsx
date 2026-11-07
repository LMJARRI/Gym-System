'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { formatMoney, type Membership } from '@/lib/domain'
import { formatLocalDate } from '@/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { MembershipBadge } from '@/components/membership-badge'
import { EmptyState } from '@/components/page-header'
import { initials } from '@/components/profile-form'
import { cn } from '@/lib/utils'

export type StudentRow = {
  id: string
  full_name: string
  member_number: number | null
  email: string | null
  phone: string | null
  account_status: 'active' | 'inactive'
  avatar_url: string | null
  membership: Membership | null
}

const FILTERS = [
  ['todos', 'Todos'],
  ['activa', 'Activa'],
  ['por_vencer', 'Por vencer'],
  ['vencida', 'Vencida'],
  ['pendiente', 'Pago pendiente'],
  ['deuda', 'Con saldo'],
  ['sin_plan', 'Sin membresía'],
  ['inactiva', 'Cuenta inactiva'],
] as const

function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function StudentsList({
  rows,
  today,
  noticeDays,
  currency,
  isOwner,
  initialFilter,
}: {
  rows: StudentRow[]
  today: string
  noticeDays: number
  currency: string
  isOwner: boolean
  initialFilter: string
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(FILTERS.some(([k]) => k === initialFilter) ? initialFilter : 'todos')
  const limit = addDays(today, noticeDays)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      const m = r.membership
      const live = m && (m.status === 'active' || m.status === 'pending_payment')
      const expired = m && (m.status === 'expired' || (live && m.ends_on < today))
      const matches =
        filter === 'todos' ||
        (filter === 'activa' && m?.status === 'active' && m.ends_on >= today) ||
        (filter === 'por_vencer' && live && m!.ends_on >= today && m!.ends_on <= limit) ||
        (filter === 'vencida' && expired) ||
        (filter === 'pendiente' && m?.status === 'pending_payment') ||
        (filter === 'deuda' && Number(m?.balance_due ?? 0) > 0) ||
        (filter === 'sin_plan' && !m) ||
        (filter === 'inactiva' && r.account_status === 'inactive')
      if (!matches) return false
      if (!q) return true
      return (
        r.full_name.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.phone ?? '').includes(q) ||
        String(r.member_number ?? '') === q.replace('#', '')
      )
    })
  }, [rows, query, filter, today, limit])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Buscar alumno"
            placeholder="Buscar por nombre, email, teléfono o número"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <div role="group" aria-label="Filtros" className="flex flex-wrap gap-2">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold',
                filter === key ? 'border-primary bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtered.length} de {rows.length} alumnos
      </p>

      {filtered.length === 0 ? (
        <EmptyState title="No hay alumnos con ese criterio" />
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link href={`/app/alumnos/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <Avatar className="size-10">
                  {r.avatar_url && <AvatarImage src={r.avatar_url} alt="" />}
                  <AvatarFallback className="font-bold">{initials(r.full_name)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">
                    {r.full_name || 'Sin nombre'}
                    {r.account_status === 'inactive' && <span className="ml-2 text-xs font-normal text-destructive">Inactiva</span>}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {r.member_number != null && <span className="font-mono">#{r.member_number} · </span>}
                    {r.membership ? `${r.membership.plan_name} · vence ${formatLocalDate(r.membership.ends_on, { day: '2-digit', month: 'short' })}` : 'Sin membresía'}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {r.membership && <MembershipBadge status={r.membership.ends_on < today && r.membership.status === 'active' ? 'expired' : r.membership.status} />}
                  {isOwner && Number(r.membership?.balance_due ?? 0) > 0 && (
                    <span className="font-mono text-xs text-primary">Debe {formatMoney(Number(r.membership!.balance_due), currency)}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
