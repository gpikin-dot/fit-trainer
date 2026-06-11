import type { ExerciseLibrary, WorkoutMode } from '../types/database'

// Упражнения с собственным весом: по умолчанию логируем повторы, не кг
const BODYWEIGHT_EQUIPMENT = new Set(['Без оборудования', 'Турник', 'Брусья'])

type LibInfo = Pick<ExerciseLibrary, 'exercise_type' | 'equipment'>

// Дефолтный режим логирования — по данным библиотеки упражнений
export function defaultMode(lib?: LibInfo | null): WorkoutMode {
  if (!lib) return 'weight'
  if (lib.exercise_type === 'cardio_time') return 'time'
  if (lib.exercise_type === 'cardio_reps') return 'reps'
  if (lib.equipment && BODYWEIGHT_EQUIPMENT.has(lib.equipment)) return 'reps'
  return 'weight'
}

// Режим сохранённой строки шаблона/сессии: явный mode приоритетнее дефолта
export function modeOf(saved: string | null | undefined, lib?: LibInfo | null): WorkoutMode {
  if (saved === 'reps' || saved === 'time' || saved === 'weight') return saved
  return defaultMode(lib)
}
