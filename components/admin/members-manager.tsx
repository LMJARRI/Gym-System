'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABEL, type AppRole, type Membership } from '@/lib/domain'
import { formatLocalDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MembershipBadge } from '@/components/membership-badge'
import { MembershipDialog } from '@/components/admin/membership-dialog'
import { TeacherStudentsDialog } from '@/components/admin/teacher-students-dialog'

export type Member = { id: string; full_name: string; role: AppRole; member_number: number | null }
type Data = { members: Member[]; memberships: Map<string, Membership>; assignments: { teacher_id: string; student_id: string }[] }

async function fetchMembers([, gymId]: [string, string]): Promise<Data> {
  const supabase = createClient()
  const [members, memberships, assignments] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, member_number').eq('gym_id', gymId).order('member_number'),
    supabase.from('memberships').select('id, student_id, plan_name, status, starts_on, ends_on').eq('gym_id', gymId),
    supabase.from('teacher_students').select('teacher_id, student_id').eq('gym_id', gymId),
  ])
  const error = members.error ?? memberships.error ?? assignments.error
  if (error) throw error
  return {
    members: (members.data ?? []) as Member[],
    memberships: new Map((memberships.data ?? []).map((m) => [m.student_id as string, m as Membership])),
    assignments: assignments.data ?? [],
  }
}

const ROLES: AppRole[] = ['student', 'teacher', 'staff', 'owner']

export function MembersManager({ gymId, ownerId, timeZone }: { gymId: string; ownerId: string; timeZone: string }) {
  const { data, error, isLoading, mutate } = useSWR(['members', gymId] as const, fetchMembers)
  const [editingMembership, setEditingMembership] = useState<Member | null>(null)
  const [editingTeacher, setEditingTeacher] = useState<Member | null>(null)

  async function changeRole(member: Member, role: AppRole) {
    const { error } = await createClient().rpc('owner_set_role', { p_user: member.id, p_role: role })
    if (error) toast.error('No se pudo cambiar el rol')
    else toast.success(`${member.full_name || 'Miembro'} ahora es ${ROLE_LABEL[role].toLowerCase()}`)
    mutate()
  }

  const students = data?.members.filter((m) => m.role === 'student') ?? []

  return (
    <section aria-labelledby="members-title" className="flex flex-col gap-3">
      <h2 id="members-title" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Miembros
      </h2>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : error || !data ? (
        <p className="text-sm text-destructive">No pudimos cargar los miembros.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-2xl border bg-card">
          {data.members.map((m) => {
            const membership = data.memberships.get(m.id)
            const assigned = data.assignments.filter((a) => a.teacher_id === m.id).length
            return (
              <li key={m.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-bold">
                    {m.full_name || 'Sin nombre'}
                    {m.id === ownerId ? <span className="font-normal text-muted-foreground"> (vos)</span> : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">Nº {String(m.member_number ?? 0).padStart(4, '0')}</span>
                    {m.role === 'student' ? (
                      membership ? (
                        <>
                          <MembershipBadge status={membership.status} />
                          <span>
                            {membership.plan_name} · hasta {formatLocalDate(membership.ends_on, { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </>
                      ) : (
                        <span>Sin membresía</span>
                      )
                    ) : m.role === 'teacher' ? (
                      <span>{assigned} {assigned === 1 ? 'alumno asignado' : 'alumnos asignados'}</span>
                    ) : null}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${m.id}`}>
                    Rol de {m.full_name}
                  </label>
                  <select
                    id={`role-${m.id}`}
                    value={m.role}
                    disabled={m.id === ownerId}
                    onChange={(e) => changeRole(m, e.target.value as AppRole)}
                    className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  {m.role === 'student' ? (
                    <Button size="sm" variant="outline" onClick={() => setEditingMembership(m)}>
                      Membresía
                    </Button>
                  ) : null}
                  {m.role === 'teacher' ? (
                    <Button size="sm" variant="outline" onClick={() => setEditingTeacher(m)}>
                      Asignar alumnos
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editingMembership ? (
        <MembershipDialog
          gymId={gymId}
          timeZone={timeZone}
          member={editingMembership}
          membership={data?.memberships.get(editingMembership.id) ?? null}
          onClose={() => setEditingMembership(null)}
          onSaved={() => mutate()}
        />
      ) : null}
      {editingTeacher && data ? (
        <TeacherStudentsDialog
          gymId={gymId}
          teacher={editingTeacher}
          students={students}
          assigned={new Set(data.assignments.filter((a) => a.teacher_id === editingTeacher.id).map((a) => a.student_id))}
          onClose={() => setEditingTeacher(null)}
          onSaved={() => mutate()}
        />
      ) : null}
    </section>
  )
}
