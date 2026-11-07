import { MEMBERSHIP_LABEL, type MembershipStatus } from '@/lib/domain'
import { cn } from '@/lib/utils'

const TONE: Record<MembershipStatus, string> = {
  active: 'bg-success/15 text-success',
  pending_payment: 'bg-primary/15 text-primary',
  suspended: 'bg-destructive/15 text-destructive',
  expired: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground line-through',
}

export function MembershipBadge({ status }: { status: MembershipStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold', TONE[status])}>
      {MEMBERSHIP_LABEL[status]}
    </span>
  )
}
