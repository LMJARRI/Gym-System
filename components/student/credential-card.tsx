import { QrCode } from 'lucide-react'
import { MEMBERSHIP_LABEL, type Membership, type Profile } from '@/lib/domain'
import { formatLocalDate } from '@/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { MembershipBadge } from '@/components/membership-badge'

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
}

type Props = { profile: Profile; gymName: string; membership: Membership | null; onShowQr: () => void }

export function CredentialCard({ profile, gymName, membership, onShowQr }: Props) {
  return (
    <section aria-labelledby="credential-title" className="overflow-hidden rounded-2xl border bg-card text-card-foreground">
      <div className="flex items-center justify-between gap-3 bg-foreground px-5 py-3 text-background">
        <span className="truncate text-xs font-bold uppercase tracking-widest">{gymName}</span>
        <span aria-hidden="true" className="flex items-center gap-0.5">
          <span className="h-2.5 w-1 rounded-sm bg-success" />
          <span className="h-3.5 w-1 rounded-sm bg-primary" />
          <span className="h-4 w-1 rounded-sm bg-destructive" />
        </span>
      </div>

      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {profile.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
            <AvatarFallback className="text-lg font-bold">{initials(profile.full_name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 id="credential-title" className="truncate text-2xl font-extrabold tracking-tight">
              {profile.full_name || 'Alumno'}
            </h1>
            <span className="font-mono text-sm text-muted-foreground">
              Socio Nº {String(profile.member_number ?? 0).padStart(4, '0')}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t pt-4 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Membresía</dt>
            <dd>{membership ? <MembershipBadge status={membership.status} /> : <span className="text-muted-foreground">Sin cargar</span>}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Plan</dt>
            <dd className="truncate font-medium">{membership?.plan_name ?? '—'}</dd>
          </div>
          {membership ? (
            <div className="col-span-2 flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Vigencia</dt>
              <dd className="font-medium">
                {formatLocalDate(membership.starts_on, { day: 'numeric', month: 'short' })} al{' '}
                {formatLocalDate(membership.ends_on, { day: 'numeric', month: 'short', year: 'numeric' })}
              </dd>
            </div>
          ) : null}
        </dl>

        <Button size="lg" className="h-12 w-full text-base" onClick={onShowQr}>
          <QrCode aria-hidden="true" className="size-5" />
          Mostrar QR de ingreso
        </Button>
        {membership && membership.status !== 'active' ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Tu membresía figura como {MEMBERSHIP_LABEL[membership.status].toLowerCase()}. Es posible que recepción no pueda
            registrar tu ingreso.
          </p>
        ) : null}
      </div>
    </section>
  )
}
