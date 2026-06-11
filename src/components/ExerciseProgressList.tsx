import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtExecution, fmtHistDate, maxWeight, type PastExecution } from '../lib/exerciseHistory'
import type { ActualSet } from '../types/database'

// Прогресс по упражнениям: все выполненные упражнения клиента,
// сгруппированные по упражнению библиотеки, до 4 последних результатов.
// Используется на вкладке «Прогресс» у клиента (у тренера — своя копия
// в ClientCardPage с дополнительной шапкой).

interface ExerciseProgress {
  libId: string
  name: string
  entries: PastExecution[]
}

interface ProgressQueryRow {
  library_exercise_id: string | null
  actual_reps: number | null
  actual_weight_kg: number | null
  actual_sets: ActualSet[] | null
  exercise_library: { name_ru: string | null } | null
  assigned_workout: { id: string; completed_at: string | null } | null
}

export default function ExerciseProgressList({ clientId }: { clientId: string }) {
  const [progress, setProgress] = useState<ExerciseProgress[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('exercise_results')
        .select('library_exercise_id, actual_reps, actual_weight_kg, actual_sets, exercise_library:exercises_library(name_ru), assigned_workout:assigned_workouts!inner(id, completed_at)')
        .eq('completed', true)
        .eq('assigned_workout.client_id', clientId)
        .eq('assigned_workout.status', 'completed')

      const rows = ((data ?? []) as unknown as ProgressQueryRow[])
        .filter(r => r.library_exercise_id && r.assigned_workout?.completed_at)
        .sort((a, b) => b.assigned_workout!.completed_at!.localeCompare(a.assigned_workout!.completed_at!))

      const map = new Map<string, ExerciseProgress>()
      for (const r of rows) {
        const key = r.library_exercise_id!
        let g = map.get(key)
        if (!g) {
          g = { libId: key, name: r.exercise_library?.name_ru ?? '—', entries: [] }
          map.set(key, g)
        }
        if (g.entries.length >= 4) continue
        g.entries.push({
          date: r.assigned_workout!.completed_at!,
          sets: (r.actual_sets ?? []).filter(s => s.completed),
          reps: r.actual_reps,
          weight: r.actual_weight_kg,
        })
      }
      if (!cancelled) setProgress([...map.values()])
    })()
    return () => { cancelled = true }
  }, [clientId])

  if (progress === null) {
    return <div className="text-center text-[15px] text-[var(--slate-400)] py-[28px]">Загрузка...</div>
  }
  if (progress.length === 0) {
    return (
      <div className="text-center text-[15px] text-[var(--slate-400)] leading-[1.6] py-[28px]">
        Пока нет данных.<br />Прогресс появится после первых выполненных тренировок.
      </div>
    )
  }
  return (
    <>
      {progress.map(g => {
        const w0 = maxWeight(g.entries[0])
        const w1 = g.entries.length > 1 ? maxWeight(g.entries[1]) : null
        const trend = w0 != null && w1 != null
          ? (w0 > w1 ? 'up' : w0 < w1 ? 'down' : 'flat')
          : null
        return (
          <div key={g.libId} className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px]">
            <div className="flex items-center justify-between gap-[6px] mb-[5px]">
              <span className="text-[15px] font-semibold text-[var(--slate-900)] truncate">{g.name}</span>
              {trend && (
                <span className={`text-[14px] font-bold shrink-0 ${
                  trend === 'up' ? 'text-[var(--green-600)]'
                  : trend === 'down' ? 'text-[var(--red-500)]'
                  : 'text-[var(--slate-400)]'
                }`}>
                  {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
                </span>
              )}
            </div>
            {g.entries.map((e, i) => (
              <div key={i} className="flex justify-between text-[13px] py-[1px]">
                <span className="text-[var(--slate-400)]">{fmtHistDate(e.date)}</span>
                <span className="text-[var(--slate-600)] font-semibold">{fmtExecution(e)}</span>
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
