import { supabase } from './supabase'
import type { ActualSet } from '../types/database'

export interface PastExecution {
  date: string // assigned_workouts.completed_at
  sets: ActualSet[] // только выполненные подходы
  reps: number | null
  weight: number | null
}

interface HistoryRow {
  library_exercise_id: string | null
  actual_reps: number | null
  actual_weight_kg: number | null
  actual_sets: ActualSet[] | null
  assigned_workout: { id: string; completed_at: string | null } | null
}

// Последние выполнения упражнений (по library_exercise_id) для клиента.
// Возвращает до `limit` записей на упражнение, новые сверху.
export async function fetchExerciseHistory(
  clientId: string,
  libraryExerciseIds: string[],
  opts?: { excludeAssignedId?: string; limit?: number },
): Promise<Record<string, PastExecution[]>> {
  const ids = [...new Set(libraryExerciseIds.filter(Boolean))]
  if (ids.length === 0) return {}
  const limit = opts?.limit ?? 4

  const { data, error } = await supabase
    .from('exercise_results')
    .select('library_exercise_id, actual_reps, actual_weight_kg, actual_sets, assigned_workout:assigned_workouts!inner(id, completed_at)')
    .in('library_exercise_id', ids)
    .eq('completed', true)
    .eq('assigned_workout.client_id', clientId)
    .eq('assigned_workout.status', 'completed')

  if (error || !data) return {}

  const rows = (data as unknown as HistoryRow[])
    .filter(r =>
      r.library_exercise_id
      && r.assigned_workout?.completed_at
      && r.assigned_workout.id !== opts?.excludeAssignedId,
    )
    .sort((a, b) => b.assigned_workout!.completed_at!.localeCompare(a.assigned_workout!.completed_at!))

  const out: Record<string, PastExecution[]> = {}
  for (const r of rows) {
    const key = r.library_exercise_id!
    if (!out[key]) out[key] = []
    if (out[key].length >= limit) continue
    out[key].push({
      date: r.assigned_workout!.completed_at!,
      sets: (r.actual_sets ?? []).filter(s => s.completed),
      reps: r.actual_reps,
      weight: r.actual_weight_kg,
    })
  }
  return out
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

export function fmtHistDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

// Компактная строка результата: «3×10 · 40 кг», «12/10/8 · 35 кг», «2×60с»
export function fmtExecution(e: PastExecution, mode?: 'weight' | 'reps' | 'time'): string {
  const sets = e.sets
  let repsPart: string
  let weightPart = ''

  if (sets.length > 0) {
    const reps = sets.map(s => s.reps)
    const allSame = reps.every(r => r === reps[0])
    const unit = mode === 'time' ? 'с' : ''
    repsPart = allSame && reps[0] != null
      ? `${sets.length}×${reps[0]}${unit}`
      : reps.map(r => r ?? '–').join('/') + unit
    const weights = sets.map(s => s.weight).filter((w): w is number => w != null && w > 0)
    if (mode !== 'time' && weights.length > 0) weightPart = ` · ${Math.max(...weights)} кг`
  } else {
    repsPart = e.reps != null ? `×${e.reps}` : '—'
    if (e.weight != null && e.weight > 0) weightPart = ` · ${e.weight} кг`
  }
  return repsPart + weightPart
}

// Максимальный вес выполнения — для стрелки тренда
export function maxWeight(e: PastExecution): number | null {
  const ws = e.sets.map(s => s.weight).filter((w): w is number => w != null && w > 0)
  if (ws.length > 0) return Math.max(...ws)
  return e.weight != null && e.weight > 0 ? e.weight : null
}
