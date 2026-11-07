import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import type { Plan } from '@/lib/domain'
import { PageHeader } from '@/components/page-header'
import { PlansManager } from '@/components/admin/plans-manager'

export const metadata: Metadata = { title: 'Planes' }

export default async function PlansPage() {
  const { supabase, gym } = await requireMember(['owner'])
  const { data } = await supabase
    .from('plans')
    .select('id, name, description, price, duration_count, duration_unit, status, access_rules, notes')
    .eq('gym_id', gym.id)
    .order('status')
    .order('price')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Planes" description="Planes que podés asignar a los alumnos. Los archivados no se ofrecen pero conservan su historial." />
      <PlansManager gymId={gym.id} currency={gym.currency} plans={(data ?? []) as Plan[]} />
    </div>
  )
}
