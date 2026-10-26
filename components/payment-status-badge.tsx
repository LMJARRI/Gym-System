import { PAYMENT_STATUS_LABEL, type PaymentStatus } from '@/lib/domain'
import { cn } from '@/lib/utils'

const TONE: Record<PaymentStatus, string> = {
  pending: 'bg-primary/15 text-primary',
  approved: 'bg-success/15 text-success',
  rejected: 'bg-destructive/15 text-destructive',
  void: 'bg-muted text-muted-foreground',
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold', TONE[status])}>{PAYMENT_STATUS_LABEL[status]}</span>
}
