import type { Metadata } from 'next'
import { requireMember } from '@/lib/session'
import { PageHeader } from '@/components/page-header'
import { ExercisesManager, type Exercise } from '@/components/routines/exercises-manager'

export const metadata: Metadata = { title: 'Ejercicios' }

export default async function ExercisesPage() {
  const { supabase, gym } = await requireMember(['owner', 'teacher'])
  const { data } = await supabase
    .from('exercises')
    .select('id, name, description, muscle_group, kind, instructions, media_url, status')
    .eq('gym_id', gym.id)
    .order('muscle_group')
    .order('name')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ejercicios" description="Biblioteca del gimnasio para armar rutinas. Los archivados no se ofrecen en rutinas nuevas." />
      <ExercisesManager gymId={gym.id} exercises={(data ?? []) as Exercise[]} />
    </div>
  )
}
