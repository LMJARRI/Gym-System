'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function MercadoPagoButton({ amountLabel }: { amountLabel: string }) {
  const [busy, setBusy] = useState(false)
  // One id per page view: retrying the click reuses the same checkout instead of creating several.
  const [requestId] = useState(() => crypto.randomUUID())

  async function pay() {
    setBusy(true)
    try {
      const res = await fetch('/api/mercadopago/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? 'No se pudo iniciar el pago')
        setBusy(false)
        return
      }
      window.location.assign(data.url)
    } catch {
      toast.error('Sin conexión. No se inició el pago.')
      setBusy(false)
    }
  }

  return (
    <Button size="lg" onClick={pay} disabled={busy}>
      {busy ? 'Abriendo Mercado Pago…' : `Pagar ${amountLabel} con Mercado Pago`}
    </Button>
  )
}
