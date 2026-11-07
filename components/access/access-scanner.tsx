'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import type { IDetectedBarcode, IScannerError } from '@yudiel/react-qr-scanner'
import { REASON_COPY, type AccessResult } from '@/lib/domain'
import { formatTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ResultPanel } from '@/components/access/result-panel'
import { cn } from '@/lib/utils'

const Scanner = dynamic(() => import('@yudiel/react-qr-scanner').then((m) => m.Scanner), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
})

type Phase = { kind: 'scanning' } | { kind: 'processing' } | { kind: 'result'; result: AccessResult } | { kind: 'error'; message: string }
const AUTO_RESUME_MS = 4000
const DUPLICATE_WINDOW_MS = 6000

/** Retries transient failures with the same requestId, so the server returns the original outcome. */
async function submitScan(code: string, requestId: string): Promise<AccessResult> {
  let lastError: Error = new Error('No se pudo validar el código')
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, requestId }),
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) return body as AccessResult
      lastError = new Error(body.error ?? 'No se pudo validar el código')
      if (res.status < 500) throw lastError
    } catch (err) {
      if (err === lastError) throw err
      lastError = new Error('Sin conexión. Reintentando…')
    }
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
  }
  throw lastError
}

export function AccessScanner({ timeZone, isTeacher }: { timeZone: string; isTeacher: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' })
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [recent, setRecent] = useState<AccessResult[]>([])
  const busy = useRef(false)
  const lastCode = useRef<{ value: string; at: number } | null>(null)

  async function handleCode(raw: string) {
    const code = raw.trim()
    if (!code || busy.current) return
    const previous = lastCode.current
    if (previous && previous.value === code && Date.now() - previous.at < DUPLICATE_WINDOW_MS) return
    lastCode.current = { value: code, at: Date.now() }

    busy.current = true
    setPhase({ kind: 'processing' })
    try {
      const result = await submitScan(code, crypto.randomUUID())
      setPhase({ kind: 'result', result })
      setRecent((list) => [result, ...list.filter((r) => r.event_id !== result.event_id)].slice(0, 8))
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Error inesperado' })
    } finally {
      busy.current = false
    }
  }

  function resume() {
    setPhase({ kind: 'scanning' })
  }

  useEffect(() => {
    if (phase.kind !== 'result' && phase.kind !== 'error') return
    const id = setTimeout(() => setPhase({ kind: 'scanning' }), AUTO_RESUME_MS)
    return () => clearTimeout(id)
  }, [phase])

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Control de acceso</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isTeacher ? 'Escaneá el QR de los alumnos asignados a tus clases.' : 'Apuntá la cámara al QR del alumno.'}
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <section aria-label="Escáner" className="relative aspect-square w-full overflow-hidden rounded-2xl border bg-muted">
          {cameraError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No se pudo acceder a la cámara</p>
              <p className="leading-relaxed">{cameraError}</p>
              <Button variant="outline" size="sm" onClick={() => setCameraError(null)}>
                Reintentar
              </Button>
            </div>
          ) : (
            <Scanner
              onScan={(codes: IDetectedBarcode[]) => codes[0] && handleCode(codes[0].rawValue)}
              onError={(e: IScannerError) => setCameraError(e?.message || 'Revisá los permisos del navegador.')}
              paused={phase.kind !== 'scanning'}
              formats={['qr_code']}
              constraints={{ facingMode: 'environment' }}
              allowMultiple
              scanDelay={800}
              sound={false}
              components={{ finder: true, torch: true }}
              classNames={{ container: 'h-full w-full', video: 'h-full w-full object-cover' }}
            />
          )}
          {phase.kind === 'processing' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 aria-label="Validando" className="size-10 animate-spin text-primary" />
            </div>
          ) : null}
        </section>

        <div className="flex flex-col gap-4">
          <div aria-live="assertive" className="min-h-48">
            {phase.kind === 'result' ? (
              <ResultPanel result={phase.result} timeZone={timeZone} onNext={resume} />
            ) : phase.kind === 'error' ? (
              <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-5">
                <p className="text-lg font-bold">No se pudo validar</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{phase.message}</p>
                <Button variant="outline" onClick={resume}>
                  Escanear de nuevo
                </Button>
              </div>
            ) : (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed p-5 text-center">
                <p className="font-bold">{phase.kind === 'processing' ? 'Validando…' : 'Esperando un código'}</p>
                <p className="text-sm text-muted-foreground">El resultado aparece acá.</p>
              </div>
            )}
          </div>

          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.elements.namedItem('manual') as HTMLInputElement
              lastCode.current = null
              handleCode(input.value)
              input.value = ''
            }}
          >
            <Label htmlFor="manual">Ingreso manual del código</Label>
            <div className="flex gap-2">
              <Input id="manual" name="manual" autoComplete="off" placeholder="GYMQR1:…" className="h-10 font-mono" />
              <Button type="submit" variant="secondary" className="h-10" disabled={phase.kind === 'processing'}>
                Validar
              </Button>
            </div>
          </form>
        </div>
      </div>

      {recent.length > 0 ? (
        <section aria-labelledby="recent-title" className="flex flex-col gap-2">
          <h2 id="recent-title" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Últimos escaneos
          </h2>
          <ul className="flex flex-col divide-y rounded-2xl border bg-card">
            {recent.map((r) => (
              <li key={r.event_id} className="flex items-center gap-3 px-4 py-3 text-sm">
                {r.result === 'granted' ? (
                  <CheckCircle2 aria-label="Autorizado" className="size-4 shrink-0 text-success" />
                ) : (
                  <XCircle aria-label="Rechazado" className="size-4 shrink-0 text-destructive" />
                )}
                <span className={cn('min-w-0 flex-1 truncate', !r.student && 'text-muted-foreground')}>
                  {r.student?.full_name ?? REASON_COPY[r.reason].title}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{formatTime(r.occurred_at, timeZone)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
