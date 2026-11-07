'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** After returning from Mercado Pago the webhook may take a few seconds: refresh until the balance is credited. */
export function MpReturnWatcher({ active }: { active: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    let tries = 0
    const id = setInterval(() => {
      tries += 1
      router.refresh()
      if (tries >= 15) clearInterval(id)
    }, 4000)
    return () => clearInterval(id)
  }, [active, router])
  return null
}
