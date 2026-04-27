export type UserRole = 'trainer' | 'client'
export type WorkoutStatus = 'pending' | 'completed'
export type Plan = 'free' | 'pro' | 'team'
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'pending'

export interface Profile {
  id: string
  name: string
  role: UserRole
  trainer_id: string | null
  plan: Plan
  plan_started_at: string
  created_at: string
}

export interface Invite {
  id: string
  token: string
  trainer_id: string
  used_by: string | null
  expires_at: string
  created_at: string
}

export interface Workout {
  id: string
  trainer_id: string
  name: string
  default_rest_sec: number
  is_favorite: boolean
  created_at: string
}

export type ExerciseType = 'strength' | 'cardio_reps' | 'cardio_time'

export interface ExerciseLibrary {
  id: string
  external_id: string
  name_ru: string
  name_en: string
  category: string
  equipment: string | null
  image_urls: string[]
  source: string
  exercise_type: ExerciseType
}

export interface Exercise {
  id: string
  workout_id: string
  library_exercise_id: string
  sets: number
  reps: number
  weight_kg: number
  rest_sec: number | null
  trainer_note: string | null
  target_heart_rate_bpm: number | null
  order: number
}

export interface AssignedWorkout {
  id: string
  workout_id: string
  client_id: string
  assigned_at: string
  planned_date: string | null
  completed_at: string | null
  status: WorkoutStatus
}

export interface ExerciseResult {
  id: string
  assigned_workout_id: string
  exercise_id: string
  actual_reps: number | null
  actual_weight_kg: number | null
  actual_heart_rate_bpm: number | null
  completed: boolean
  client_note: string | null
}

export interface PlanLimits {
  plan: Plan
  max_clients: number | null
  max_workouts: number | null
  max_exercises_per_workout: number | null
  max_invites_active: number | null
}

export interface Subscription {
  id: string
  user_id: string
  plan: Plan
  status: SubscriptionStatus
  provider: string | null
  provider_subscription_id: string | null
  started_at: string
  expires_at: string | null
  cancelled_at: string | null
}

// Joined types for UI convenience
export interface ExerciseWithLibrary extends Exercise {
  exercise_library: ExerciseLibrary
}

export interface AssignedWorkoutWithWorkout extends AssignedWorkout {
  workout: Workout
}
