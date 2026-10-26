import type { SupabaseClient } from '@supabase/supabase-js'
import type { Exercise } from '@/components/routines/exercises-manager'

export type PersonOption = { id: string; full_name: string; member_number?: number | null }

export async function loadEditorData(supabase: SupabaseClient, gymId: string, isOwner: boolean) {
  const [students, exercises, teachers] = await Promise.all([
    supabase.from('profiles').select('id, full_name, member_number').eq('gym_id', gymId).eq('role', 'student').order('full_name'),
    supabase.from('exercises').select('id, name, description, muscle_group, kind, instructions, media_url, status').eq('gym_id', gymId).order('name'),
    isOwner
      ? supabase.from('profiles').select('id, full_name').eq('gym_id', gymId).eq('role', 'teacher').order('full_name')
      : Promise.resolve({ data: [] as PersonOption[] }),
  ])
  return {
    students: (students.data ?? []) as PersonOption[],
    exercises: (exercises.data ?? []) as Exercise[],
    teachers: (teachers.data ?? []) as PersonOption[],
  }
}
