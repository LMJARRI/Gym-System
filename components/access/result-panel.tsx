import { CheckCircle2, XCircle } from 'lucide-react'
import { REASON_COPY, type AccessResult } from '@/lib/domain'
import { formatTime } from '@/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { MembershipBadge } from '@/components/membership-badge'
import { initials } from '@/components/student/credential-card'
import { cn } from '@/lib/utils'

export function ResultPanel({ result, timeZone, onNext }: { result: AccessResult; timeZone: string; onNext: () => void }) {
  const granted = result.result === 'granted'
  const copy = REASON_COPY[result.reason]
  const student = result.student

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border p-5',
        granted ? 'border-success/50 bg-success/10' : 'border-destructive/50 bg-destructive/10',
      )}
    >
      <div className="flex items-center gap-3">
        {granted ? (
          <CheckCircle2 aria-hidden="true" className="size-9 shrink-0 text-success" />
        ) : (
          <XCircle aria-hidden="true" className="size-9 shrink-0 text-destructive" />
        )}
        <div className="flex flex-col">
          <p className="text-xl font-extrabold tracking-tight">{granted ? 'Ingreso autorizado' : copy.title}</p>
          <p className="text-sm text-muted-foreground">
            {granted ? `Registrado ${formatTime(result.occurred_at, timeZone)}` : copy.detail}
            {result.replayed ? ' (reintento)' : ''}
          </p>
        </div>
      </div>

      {student ? (
        <div className="flex items-center gap-3 rounded-xl bg-card p-3">
          <Avatar className="size-12">
            {student.avatar_url ? <AvatarImage src={student.avatar_url} alt="" /> : null}
            <AvatarFallback className="font-bold">{initials(student.full_name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate font-bold">{student.full_name}</span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">Nº {String(student.member_number ?? 0).padStart(4, '0')}</span>
              {student.membership_status ? <MembershipBadge status={student.membership_status} /> : null}
              {student.membership_plan ? <span className="truncate">{student.membership_plan}</span> : null}
            </span>
          </div>
        </div>
      ) : null}

      <Button variant={granted ? 'default' : 'outline'} onClick={onNext}>
        Escanear siguiente
      </Button>
    </div>
  )
}
