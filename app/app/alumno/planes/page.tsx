import type { Metadata } from 'next'
import Link from 'next/link'
import { requireMember } from '@/lib/session'
import { MEMBERSHIP_COLUMNS, type Membership } from '@/lib/domain'
import { formatLocalDate, todayIn } from '@/lib/format'
import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { MembershipBadge } from '@/components/membership-badge'
import { PlanPicker, type PickerPlan } from '@/components/student/plan-picker'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Elegir plan' }

export default async function ChoosePlanPage() {
  const { supabase, gym, profile } = await requireMember(['student'])
  const [{ data: m }, { data: plans }, { count: reviewing }] = await Promise.all([
    supabase.from('memberships').select(MEMBERSHIP_COLUMNS).eq('student_id', profile.id).maybeSingle(),
    supabase.from('plans').select('id, name, description, price, duration_count, duration_unit').eq('gym_id', gym.id).eq('status', 'active').order('price'),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('student_id', profile.id).eq('status', 'pending'),
  ])
  const membership = m as Membership | null
  const today = todayIn(gym.timezone)
  const balance = Number(membership?.balance_due ?? 0)

  // Mirrors student_select_plan; the database function is the real authority.
  let blockedReason: string | null = null
  if (membership?.status === 'suspended') blockedReason = 'Tu membresía está suspendida. Consultá en el gimnasio.'
  else if (membership?.status === 'active' && membership.ends_on >= today)
    blockedReason = `Ya tenés una membresía vigente hasta el ${formatLocalDate(membership.ends_on, { day: 'numeric', month: 'long', year: 'numeric' })}. Podrás elegir otro plan cuando venza.`
  else if (membership && balance > 0 && balance !== Number(membership.agreed_price ?? 0))
    blockedReason = 'Tenés un saldo pendiente. Pagalo o pedile al gimnasio que lo ajuste antes de cambiar de plan.'
  else if ((reviewing ?? 0) > 0) blockedReason = 'Tenés un comprobante en revisión. Esperá a que el gimnasio lo resuelva.'

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <PageHeader title="Elegir plan" description="Elegí una de las membresías del gimnasio. Después pagás con Mercado Pago o por transferencia." />

      {membership ? (
        <section aria-label="Tu membresía actual" className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
          <MembershipBadge status={membership.status} />
          <span className="text-sm font-semibold">{membership.plan_name}</span>
          <span className="text-sm text-muted-foreground">vence {formatLocalDate(membership.ends_on, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          {balance > 0 ? (
            <Button size="sm" className="ml-auto" nativeButton={false} render={<Link href="/app/alumno/pagos" />}>
              Pagar saldo
            </Button>
          ) : null}
        </section>
      ) : null}

      {blockedReason ? (
        <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          {blockedReason}
        </p>
      ) : null}

      <section aria-labelledby="plans-title" className="flex flex-col gap-3">
        <SectionTitle id="plans-title">Planes disponibles</SectionTitle>
        {plans && plans.length > 0 ? (
          <PlanPicker plans={plans as PickerPlan[]} currency={gym.currency} blockedReason={blockedReason} currentPlanId={membership?.plan_id ?? null} />
        ) : (
          <EmptyState title="Todavía no hay planes" detail="El gimnasio aún no publicó membresías. Consultá en recepción." />
        )}
      </section>
    </div>
  )
}
