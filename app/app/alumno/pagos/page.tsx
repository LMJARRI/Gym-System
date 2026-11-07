import type { Metadata } from 'next'
import Link from 'next/link'
import { requireMember } from '@/lib/session'
import { formatMoney, MEMBERSHIP_COLUMNS, PAYMENT_COLUMNS, PAYMENT_METHOD_LABEL, type Membership, type Payment } from '@/lib/domain'
import { formatDateTime, formatLocalDate } from '@/lib/format'
import { PageHeader, SectionTitle } from '@/components/page-header'
import { PaymentStatusBadge } from '@/components/payment-status-badge'
import { SubmitReceiptForm } from '@/components/student/submit-receipt-form'
import { MercadoPagoButton } from '@/components/student/mercadopago-button'
import { MpReturnWatcher } from '@/components/student/mp-return-watcher'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Mis pagos' }

export default async function MyPaymentsPage({ searchParams }: { searchParams: Promise<{ mp?: string }> }) {
  const { mp } = await searchParams
  const { supabase, gym, profile } = await requireMember(['student'])
  const [{ data: m }, { data: payments }] = await Promise.all([
    supabase.from('memberships').select(MEMBERSHIP_COLUMNS).eq('student_id', profile.id).maybeSingle(),
    supabase.from('payments').select(PAYMENT_COLUMNS).eq('student_id', profile.id).order('submitted_at', { ascending: false }).limit(50),
  ])
  const membership = m as Membership | null
  const balance = Number(membership?.balance_due ?? 0)
  const mpEnabled = Boolean(process.env.MP_ACCESS_TOKEN)
  const waitingForMp = (mp === 'success' || mp === 'pending') && balance > 0

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader title="Mis pagos" description="Pagá con Mercado Pago (se acredita solo) o informá una transferencia subiendo el comprobante: el gimnasio la revisa y, al aprobarla, se acredita en tu membresía." />

      <section aria-labelledby="balance-title" className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-2xl border bg-card p-5">
          <span id="balance-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saldo pendiente</span>
          <span className={balance > 0 ? 'font-mono text-3xl font-bold tabular-nums text-primary' : 'font-mono text-3xl font-bold tabular-nums'}>
            {formatMoney(balance, gym.currency)}
          </span>
          {membership && (
            <span className="text-xs text-muted-foreground">
              {membership.plan_name} · vence {formatLocalDate(membership.ends_on, { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border bg-card p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datos para transferir</span>
          <p className="whitespace-pre-line text-sm leading-relaxed">{gym.transfer_instructions || 'Consultá los datos en recepción.'}</p>
        </div>
      </section>

      <MpReturnWatcher active={waitingForMp} />
      {waitingForMp ? (
        <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          Estamos esperando la confirmación de Mercado Pago. Se actualiza sola en unos segundos.
        </p>
      ) : null}
      {mp === 'failure' ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          El pago no se completó. Podés intentarlo de nuevo.
        </p>
      ) : null}

      {!membership ? (
        <section aria-label="Elegir plan" className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-5">
          <p className="text-sm">Todavía no elegiste un plan.</p>
          <Button nativeButton={false} render={<Link href="/app/alumno/planes" />}>
            Elegir plan
          </Button>
        </section>
      ) : balance > 0 && mpEnabled ? (
        <section aria-labelledby="mp-title" className="flex flex-col gap-3">
          <SectionTitle id="mp-title">Pagar online</SectionTitle>
          <div className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Se acredita automáticamente apenas Mercado Pago confirma el pago.</p>
            <MercadoPagoButton amountLabel={formatMoney(balance, gym.currency)} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="submit-title" className="flex flex-col gap-3">
        <SectionTitle id="submit-title">Informar una transferencia</SectionTitle>
        <SubmitReceiptForm gymId={gym.id} userId={profile.id} currency={gym.currency} suggested={balance > 0 ? balance : undefined} disabled={!membership} />
      </section>

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <SectionTitle id="history-title">Historial</SectionTitle>
        {payments && payments.length > 0 ? (
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {(payments as Payment[]).map((p) => (
              <li key={p.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono font-semibold tabular-nums">{formatMoney(Number(p.amount), gym.currency)}</span>
                  <PaymentStatusBadge status={p.status} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {PAYMENT_METHOD_LABEL[p.method]} · enviado {formatDateTime(p.submitted_at, gym.timezone)}
                </span>
                {p.review_notes && (p.status === 'rejected' || p.status === 'void') && <span className="text-xs text-destructive">Motivo: {p.review_notes}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay pagos.</p>
        )}
      </section>
    </div>
  )
}
