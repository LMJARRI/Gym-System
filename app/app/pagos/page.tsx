import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { PageHeader } from '@/components/page-header'
import { PaymentsReview } from '@/components/admin/payments-review'

export const metadata: Metadata = { title: 'Pagos' }

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { gym } = await requireMember(['owner'])
  const { estado } = await searchParams
  const initial = ['pending', 'approved', 'rejected', 'void'].includes(estado ?? '') ? estado! : 'pending'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pagos" description="Revisá comprobantes y registrá pagos en efectivo. Solo los aprobados impactan en ingresos y membresías." />
      <PaymentsReview gymId={gym.id} currency={gym.currency} timeZone={gym.timezone} initialStatus={initial as 'pending'} />
    </div>
  )
}
