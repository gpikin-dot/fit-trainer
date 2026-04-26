import { supabase } from './supabase'
import type { Plan } from '../types/database'

async function getPlanLimits(plan: Plan) {
  const { data } = await supabase
    .from('plan_limits')
    .select('*')
    .eq('plan', plan)
    .single()
  return data
}

async function getProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

export async function canCreateWorkout(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const profile = await getProfile(userId)
  if (!profile) return { allowed: false, reason: 'Профиль не найден' }
  const limits = await getPlanLimits(profile.plan)
  if (!limits || limits.max_workouts === null) return { allowed: true }

  const { count } = await supabase
    .from('workouts')
    .select('*', { count: 'exact', head: true })
    .eq('trainer_id', userId)

  if (count !== null && count >= limits.max_workouts) {
    return { allowed: false, reason: `Лимит вашего тарифа: ${limits.max_workouts} тренировок` }
  }
  return { allowed: true }
}

export async function canInviteClient(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const profile = await getProfile(userId)
  if (!profile) return { allowed: false, reason: 'Профиль не найден' }
  const limits = await getPlanLimits(profile.plan)
  if (!limits || limits.max_clients === null) return { allowed: true }

  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('trainer_id', userId)

  if (count !== null && count >= limits.max_clients) {
    return { allowed: false, reason: `Лимит вашего тарифа: ${limits.max_clients} клиентов` }
  }
  return { allowed: true }
}

export async function canCreateInvite(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const profile = await getProfile(userId)
  if (!profile) return { allowed: false, reason: 'Профиль не найден' }
  const limits = await getPlanLimits(profile.plan)
  if (!limits || limits.max_invites_active === null) return { allowed: true }

  const { count } = await supabase
    .from('invites')
    .select('*', { count: 'exact', head: true })
    .eq('trainer_id', userId)
    .is('used_by', null)
    .gt('expires_at', new Date().toISOString())

  if (count !== null && count >= limits.max_invites_active) {
    return { allowed: false, reason: `Лимит активных приглашений: ${limits.max_invites_active}` }
  }
  return { allowed: true }
}

export async function canAddExercise(userId: string, workoutId: string): Promise<{ allowed: boolean; reason?: string }> {
  const profile = await getProfile(userId)
  if (!profile) return { allowed: false, reason: 'Профиль не найден' }
  const limits = await getPlanLimits(profile.plan)
  if (!limits || limits.max_exercises_per_workout === null) return { allowed: true }

  const { count } = await supabase
    .from('exercises')
    .select('*', { count: 'exact', head: true })
    .eq('workout_id', workoutId)

  if (count !== null && count >= limits.max_exercises_per_workout) {
    return { allowed: false, reason: `Лимит упражнений в тренировке: ${limits.max_exercises_per_workout}` }
  }
  return { allowed: true }
}
