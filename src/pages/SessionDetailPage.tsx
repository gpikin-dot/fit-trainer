import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
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
  if (result === 'better') return 'font-bold text-green-600'
  if (result === 'worse') return 'font-bold text-red-500'
  return ''
}

// ---------------------------------------------------------------------------
// Unified exercise row shape used for rendering
// ---------------------------------------------------------------------------

interface ExerciseRow {
  /** The id used to match against ExerciseResult.exercise_id */
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

    // 1. Load assigned_workout
    const { data: aw, error: awErr } = await supabase
      .from('assigned_workouts')
      .select('*')
      .eq('id', id)
      .single()

    if (awErr || !aw || aw.status !== 'completed') {
      setNotFound(true)
      setLoading(false)
      return
    }

    setAssignment(aw as AssignedWorkout)

    // 2–5. Run remaining queries in parallel
    const [
      sessionExResult,
      oldExResult,
      resultsResult,
      clientResult,
      workoutResult,
    ] = await Promise.all([
      // 2a. session_exercises joined with exercises_library
      supabase
        .from('session_exercises')
        .select('*, exercise_library:exercises_library(*)')
        .eq('assigned_workout_id', id)
        .order('order', { ascending: true }),

      // 2b. exercises fallback joined with exercises_library (fetched in parallel, used only if session_exercises empty)
      supabase
        .from('exercises')
        .select('*, exercise_library:exercises_library(*)')
        .eq('workout_id', aw.workout_id)
        .order('order', { ascending: true }),

      // 3. exercise_results
      supabase
        .from('exercise_results')
        .select('*')
        .eq('assigned_workout_id', id),

      // 4. client profile
      supabase
        .from('profiles')
        .select('name')
        .eq('id', aw.client_id)
        .single(),

      // 5. workout
      supabase
        .from('workouts')
        .select('*')
        .eq('id', aw.workout_id)
        .single(),
    ])

    // Workout & client
    if (workoutResult.data) setWorkout(workoutResult.data as Workout)
    if (clientResult.data) setClientName((clientResult.data as { name: string }).name)

    // Exercise results
    if (resultsResult.data) setResults(resultsResult.data as ExerciseResult[])

    // Build unified exercise rows
    const sessionExs = (sessionExResult.data ?? []) as (SessionExercise & {
      exercise_library: ExerciseLibrary
    })[]

    if (sessionExs.length > 0) {
      setExercises(
        sessionExs.map((se) => ({
          id: se.id,
          name: se.exercise_library?.name_ru ?? se.exercise_library?.name_en ?? '—',
          sets: se.sets,
          reps: se.reps,
          weight_kg: se.weight_kg,
          trainer_note: se.trainer_note,
        }))
      )
    } else {
      // Fallback: old exercises table
      const oldExs = (oldExResult.data ?? []) as (Exercise & {
        exercise_library: ExerciseLibrary
      })[]
      setExercises(
        oldExs.map((ex) => ({
          id: ex.id,
          name: ex.exercise_library?.name_ru ?? ex.exercise_library?.name_en ?? '—',
          sets: ex.sets,
          reps: ex.reps,
          weight_kg: ex.weight_kg,
          trainer_note: ex.trainer_note,
        }))
      )
    }

    setLoading(false)
  }

  // ---------------------------------------------------------------------------
  // Derived stats
  // ---------------------------------------------------------------------------

  const totalExercises = exercises.length
  const completedCount = exercises.filter((ex) => {
    const result = results.find((r) => r.exercise_id === ex.id)
    return result?.completed === true
  }).length

  const progressPct = totalExercises > 0 ? Math.round((completedCount / totalExercises) * 100) : 0

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-slate-400 text-sm">Загрузка...</div>
        </div>
      </Layout>
    )
  }

  if (notFound || !assignment || !workout) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-slate-400 text-sm">Не найдено</div>
        </div>
      </Layout>
    )
  }

  const completedAt = assignment.completed_at ?? assignment.assigned_at

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-6 pb-28">
        {/* Header */}
        <div className="mb-5">
          <button
            onClick={() => navigate(`/trainer/client/${assignment.client_id}`)}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm mb-4 -ml-1"
          >
            <ArrowLeft size={16} />
            {clientName || 'Клиент'}
          </button>

          <h1 className="text-xl font-bold text-slate-800 leading-tight">{workout.name}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{fmtDate(completedAt)}</p>
        </div>

        {/* Status row */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-0.5">
              <span>✓</span> Выполнена
            </span>
            <span className="text-sm text-slate-500">
              {completedCount} / {totalExercises} упражнений
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Exercise list */}
        <div className="mb-6">
          {exercises.map((ex) => {
            const result = results.find((r) => r.exercise_id === ex.id)
            const isCompleted = result?.completed === true
            const hasResult = !!result && isCompleted

            const repsCompare = hasResult ? compare(result.actual_reps, ex.reps) : 'same'
            const weightCompare = hasResult ? compare(result.actual_weight_kg, ex.weight_kg) : 'same'

            return (
              <div
                key={ex.id}
                className="bg-white border border-slate-200 rounded-xl p-4 mb-2"
              >
                <p className="text-sm font-semibold text-slate-800 mb-1">{ex.name}</p>

                {hasResult ? (
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-400">
                      план: {ex.sets}×{ex.reps} · {ex.weight_kg}кг
                    </p>
                    <p className="text-xs text-slate-700">
                      факт: {ex.sets}×
                      <span className={valueClass(repsCompare)}>
                        {result.actual_reps ?? ex.reps}
                      </span>{' '}
                      ·{' '}
                      <span className={valueClass(weightCompare)}>
                        {result.actual_weight_kg ?? ex.weight_kg}
                      </span>
                      кг
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-300 italic">Пропущено</p>
                )}

                {result?.client_note ? (
                  <p className="text-xs text-slate-400 italic mt-1">{result.client_note}</p>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Action buttons */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-4 flex flex-col gap-2 max-w-lg mx-auto">
          <button
            onClick={() =>
              navigate(
                `/trainer/assign?workoutId=${workout.id}&clientId=${assignment.client_id}&repeatFrom=${assignment.id}`
              )
            }
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors"
          >
            Повторить тренировку
          </button>
          <button
            onClick={() => navigate(`/trainer/workout/${workout.id}/edit`)}
            className="w-full py-3 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-colors"
          >
            Редактировать шаблон
          </button>
        </div>
      </div>
    </Layout>
  )
}
