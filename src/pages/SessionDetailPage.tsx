import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import type {
  AssignedWorkout,
  Workout,
  SessionExercise,
  ExerciseLibrary,
  ExerciseResult,
  Exercise,
} from '../types/database'

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const DAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

function fmtDate(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return `${DAYS_RU[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}.`
}

// ---------------------------------------------------------------------------
// Comparison colour helper
// ---------------------------------------------------------------------------

type CompareResult = 'better' | 'worse' | 'same'

function compare(actual: number | null, plan: number): CompareResult {
  if (actual === null) return 'same'
  if (actual > plan) return 'better'
  if (actual < plan) return 'worse'
  return 'same'
}

function valueClass(result: CompareResult): string {
  if (result === 'better') return 'font-bold text-[var(--green-600)]'
  if (result === 'worse') return 'font-bold text-[var(--red-600)]'
  return ''
}

// ---------------------------------------------------------------------------
// Unified exercise row shape
// ---------------------------------------------------------------------------

interface ExerciseRow {
  id: string
  name: string
  sets: number
  reps: number
  weight_kg: number
  trainer_note: string | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SessionDetailPage() {
  const { assignedWorkoutId } = useParams<{ assignedWorkoutId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [assignment, setAssignment] = useState<AssignedWorkout | null>(null)
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [clientName, setClientName] = useState<string>('')
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [results, setResults] = useState<ExerciseResult[]>([])

  useEffect(() => {
    if (!assignedWorkoutId) {
      setNotFound(true)
      setLoading(false)
      return
    }
    void loadData(assignedWorkoutId)
  }, [assignedWorkoutId])

  async function loadData(id: string) {
    setLoading(true)

    const { data: aw, error: awErr } = await supabase
      .from('assigned_workouts').select('*').eq('id', id).single()

    if (awErr || !aw || aw.status !== 'completed') {
      setNotFound(true)
      setLoading(false)
      return
    }

    setAssignment(aw as AssignedWorkout)

    const [
      sessionExResult,
      oldExResult,
      resultsResult,
      clientResult,
      workoutResult,
    ] = await Promise.all([
      supabase.from('session_exercises').select('*, exercise_library:exercises_library(*)')
        .eq('assigned_workout_id', id).order('order', { ascending: true }),
      supabase.from('exercises').select('*, exercise_library:exercises_library(*)')
        .eq('workout_id', aw.workout_id).order('order', { ascending: true }),
      supabase.from('exercise_results').select('*').eq('assigned_workout_id', id),
      supabase.from('profiles').select('name').eq('id', aw.client_id).single(),
      supabase.from('workouts').select('*').eq('id', aw.workout_id).single(),
    ])

    if (workoutResult.data) setWorkout(workoutResult.data as Workout)
    if (clientResult.data) setClientName((clientResult.data as { name: string }).name)
    if (resultsResult.data) setResults(resultsResult.data as ExerciseResult[])

    const sessionExs = (sessionExResult.data ?? []) as (SessionExercise & { exercise_library: ExerciseLibrary })[]

    if (sessionExs.length > 0) {
      setExercises(sessionExs.map((se) => ({
        id: se.id,
        name: se.exercise_library?.name_ru ?? se.exercise_library?.name_en ?? '—',
        sets: se.sets, reps: se.reps, weight_kg: se.weight_kg, trainer_note: se.trainer_note,
      })))
    } else {
      const oldExs = (oldExResult.data ?? []) as (Exercise & { exercise_library: ExerciseLibrary })[]
      setExercises(oldExs.map((ex) => ({
        id: ex.id,
        name: ex.exercise_library?.name_ru ?? ex.exercise_library?.name_en ?? '—',
        sets: ex.sets, reps: ex.reps, weight_kg: ex.weight_kg, trainer_note: ex.trainer_note,
      })))
    }

    setLoading(false)
  }

  const totalExercises = exercises.length
  const completedCount = exercises.filter((ex) => {
    const result = results.find((r) => r.exercise_id === ex.id)
    return result?.completed === true
  }).length

  const progressPct = totalExercises > 0 ? Math.round((completedCount / totalExercises) * 100) : 0

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-[var(--slate-400)] text-[11px]">Загрузка...</div>
      </Layout>
    )
  }

  if (notFound || !assignment || !workout) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-[var(--slate-400)] text-[11px]">Не найдено</div>
      </Layout>
    )
  }

  const completedAt = assignment.completed_at ?? assignment.assigned_at

  return (
    <Layout>
      <div className="pt-[11px] pb-[80px]">
        {/* Back */}
        <button
          onClick={() => navigate(`/trainer/client/${assignment.client_id}`)}
          className="text-[10px] font-semibold text-[var(--indigo-500)] flex items-center gap-1 mb-[9px]"
        >
          ← {clientName || 'Клиент'}
        </button>

        <h1 className="text-[16px] font-bold text-[var(--slate-900)] tracking-[-0.01em]">{workout.name}</h1>
        <p className="text-[10px] text-[var(--slate-400)] mb-[11px]">{fmtDate(completedAt)}</p>

        {/* Status card */}
        <div className="bg-white border border-[var(--border)] rounded-[10px] px-[12px] py-[11px] mb-[10px]">
          <div className="flex justify-between mb-[9px]">
            <div className="flex gap-[5px] items-center">
              <span className="text-[14px] text-[var(--green-600)]">✓</span>
              <span className="text-[13px] font-bold text-[var(--green-600)]">Выполнена</span>
            </div>
            <div className="text-right">
              <div className="text-[15px] font-bold text-[var(--slate-900)] leading-none">{completedCount} / {totalExercises}</div>
              <div className="text-[9px] text-[var(--slate-400)] mt-[2px]">упражнений</div>
            </div>
          </div>
          <div className="h-[5px] bg-[var(--slate-100)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${progressPct === 100 ? 'bg-[var(--green-300)]' : 'bg-[var(--amber-300)]'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Exercises */}
        {exercises.map((ex) => {
          const result = results.find((r) => r.exercise_id === ex.id)
          const isCompleted = result?.completed === true
          const hasResult = !!result && isCompleted

          const repsCompare = hasResult ? compare(result.actual_reps, ex.reps) : 'same'
          const weightCompare = hasResult ? compare(result.actual_weight_kg, ex.weight_kg) : 'same'

          return (
            <div key={ex.id} className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px]">
              <p className="text-[11px] font-bold text-[var(--slate-900)] mb-[4px]">{ex.name}</p>

              {hasResult ? (
                <>
                  <p className="text-[9px] text-[var(--slate-400)] mb-[2px]">
                    план: {ex.sets}подх × {ex.reps}повт · {ex.weight_kg}кг
                  </p>
                  <p className="text-[9px] text-[var(--slate-700)]">
                    факт: {ex.sets}×<span className={valueClass(repsCompare)}>{result.actual_reps ?? ex.reps}</span>{' '}
                    · <span className={valueClass(weightCompare)}>{result.actual_weight_kg ?? ex.weight_kg}</span>кг
                  </p>
                </>
              ) : (
                <p className="text-[9px] text-[var(--slate-300)] italic">Пропущено</p>
              )}

              {result?.client_note ? (
                <p className="text-[9px] text-[var(--slate-500)] italic mt-[3px]">«{result.client_note}»</p>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Sticky action buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border)] px-[13px] pt-[11px] pb-[16px] max-w-[390px] mx-auto">
        <button
          onClick={() =>
            navigate(`/trainer/assign?workoutId=${workout.id}&clientId=${assignment.client_id}&repeatFrom=${assignment.id}`)
          }
          className="w-full bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] text-white rounded-[9px] py-[10px] text-[11px] font-bold mb-[6px]"
        >
          Повторить тренировку
        </button>
        <button
          onClick={() => navigate(`/trainer/workout/${workout.id}/edit`)}
          className="w-full bg-white border border-[var(--slate-200)] text-[var(--slate-700)] rounded-[9px] py-[9px] text-[11px] font-semibold"
        >
          Изменить тренировку
        </button>
      </div>
    </Layout>
  )
}
