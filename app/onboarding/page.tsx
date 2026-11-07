import { Suspense } from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { AuthShell } from '@/components/auth-shell'
import { OnboardingForms } from '@/components/onboarding-forms'

export const metadata: Metadata = { title: 'Elegí tu gimnasio' }

async function GuardedOnboarding() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (session.gym) redirect('/app')
  return <OnboardingForms />
}

export default function OnboardingPage() {
  return (
    <AuthShell title="Elegí tu gimnasio" description="Ingresá el código que te dio tu gimnasio, o creá uno nuevo si sos el dueño.">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" aria-hidden="true" />}>
        <GuardedOnboarding />
      </Suspense>
    </AuthShell>
  )
}
