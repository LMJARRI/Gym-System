'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { REASON_COPY, type QrIssue } from '@/lib/domain'
import type { MyAccessEvent } from '@/hooks/use-my-access-realtime'
import { formatTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

type IssuedQr = QrIssue & { clockOffsetMs: number }

async function issueQr(): Promise<IssuedQr> {
  const res = await fetch('/api/qr', { method: 'POST', cache: 'no-store' })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'No se pudo generar el QR')
  // Countdown uses server time so a skewed phone clock cannot extend the QR.
  return { ...body, clockOffsetMs: Date.parse(body.server_now) - Date.now() }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  lastEvent: MyAccessEvent | null
  onRegenerate: () => void
  timeZone: string
}

export function QrDialog({ open, onOpenChange, lastEvent, onRegenerate, timeZone }: Props) {
  const showing = open && !lastEvent
  const { data, error, isValidating, mutate } = useSWR(showing ? 'qr-token' : null, issueQr, {
    // Renew a few seconds before expiry so the student never shows a dead code.
    refreshInterval: (latest) => (latest ? Math.max(5, latest.ttl_seconds - 3) * 1000 : 0),
    revalidateOnFocus: true,
    revalidateIfStale: true,
    dedupingInterval: 1000,
    errorRetryInterval: 3000,
  })

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!showing) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [showing])

  const remainingMs = data ? Date.parse(data.expires_at) - (now + data.clockOffsetMs) : 0
  const expired = Boolean(data) && remainingMs <= 0

  useEffect(() => {
    if (showing && expired && !isValidating) mutate()
  }, [showing, expired, isValidating, mutate])

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const progress = data ? Math.max(0, Math.min(1, remainingMs / (data.ttl_seconds * 1000))) : 0

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{lastEvent ? REASON_COPY[lastEvent.reason].title : 'QR de ingreso'}</DialogTitle>
          <DialogDescription>
            {lastEvent
              ? lastEvent.result === 'granted'
                ? `Registrado a las ${formatTime(lastEvent.occurred_at, timeZone)}.`
                : 'Recepción no pudo registrar tu ingreso. Consultá en el mostrador.'
              : 'Mostralo en recepción. Es de un solo uso y se renueva automáticamente.'}
          </DialogDescription>
        </DialogHeader>

        {lastEvent ? (
          <div className="flex flex-col items-center gap-5 py-4">
            {lastEvent.result === 'granted' ? (
              <CheckCircle2 aria-hidden="true" className="size-20 text-success" />
            ) : (
              <XCircle aria-hidden="true" className="size-20 text-destructive" />
            )}
            <div className="flex w-full flex-col gap-2">
              {lastEvent.result === 'denied' ? (
                <Button size="lg" className="w-full" onClick={onRegenerate}>
                  Generar un QR nuevo
                </Button>
              ) : null}
              <Button size="lg" variant={lastEvent.result === 'granted' ? 'default' : 'outline'} className="w-full" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="relative flex aspect-square w-full max-w-64 items-center justify-center rounded-xl bg-[#ffffff] p-4">
              {data && !expired ? (
                <QRCodeSVG
                  value={data.payload}
                  size={512}
                  level="M"
                  marginSize={0}
                  bgColor="#ffffff"
                  fgColor="#111318"
                  className="h-full w-full"
                  role="img"
                  aria-label="Código QR de ingreso"
                />
              ) : error && !data ? (
                <p className="text-center text-sm text-[#111318]">{error.message}</p>
              ) : (
                <Skeleton className="h-full w-full bg-[#e6e8ec]" />
              )}
            </div>

            <div className="flex w-full max-w-64 flex-col gap-2" aria-live="polite">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="text-center font-mono text-sm text-muted-foreground">
                {data && !expired ? `Vence en ${seconds}s` : 'Generando código…'}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
