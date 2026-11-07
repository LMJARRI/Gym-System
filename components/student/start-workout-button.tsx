'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Play } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { rpcErrorMessage } from '@/lib/domain'
import { Button } from '@/components/ui/button'

export function StartWorkoutButton({ routineId, resumeId, blocked }: { routineId: string; resumeId?: string; blocked?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function start() {
    if (resumeId) return router.push(`/app/alumno/entrenar/${resumeId}`)
    setBusy(true)
    const { data, error } = await createClient().rpc('start_workout', { p_routine: routineId })
    setBusy(false)
    if (error) return toast.error(rpcErrorMessage(error, 'No se pudo empezar el entrenamiento'))
    router.push(`/app/alumno/entrenar/${data as string}`)
  }

  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <Button onClick={start} disabled={busy || blocked}>
        <Play aria-hidden="true" />
        {resumeId ? 'Continuar entrenamiento' : busy ? 'Preparando…' : 'Empezar entrenamiento'}
      </Button>
      {blocked && <span className="text-xs text-muted-foreground">Terminá el entrenamiento en curso primero.</span>}
    </div>
  )
}
