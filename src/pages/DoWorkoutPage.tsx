import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Volume2, VolumeX, SkipForward, Plus, Pause, Play } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTimer } from '../contexts/TimerContext'
import Layout from '../components/Layout'
import { ErrorMessage } from '../components/UI'
import type { AssignedWorkout, Workout, Exercise, ExerciseLibrary, ExerciseResult } from '../types/database'

interface SetState {
  completed: boolean
  reps: string
  weight: string
}

interface ExerciseState {
  sets: SetState[]
  note: string
  heartRate: string
}

function storageKey(assignedId: string) {
  return `workout_progress_${assignedId}`
}

const RING_C = 220
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function DoWorkoutPage() {
  const { assignedId } = useParams<{ assignedId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const {
    timerSec, timerTotal, timerActive, timerPaused, timerNextEx, timerExerciseId,
    soundEnabled, startTimer, togglePause, addTime, skipTimer, setSoundEnabled,
  } = useTimer()

  const [assignment, setAssignment] = useState<AssignedWorkout | null>(null)
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [exercises, setExercises] = useState<(Exercise & { exercise_library: ExerciseLibrary })[]>([])
  const [existingResults, setExistingResults] = useState<ExerciseResult[]>([])
  const [exState, setExState] = useState<Record<string, ExerciseState>>({})
  const [loaded, setLoaded] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmInfo, setConfirmInfo] = useState({ done: 0, total: 0 })

  useEffect(() => {
    if (assignedId && Object.keys(exState).length > 0) {
      localStorage.setItem(storageKey(assignedId), JSON.stringify(exState))
    }
  }, [exState, assignedId])

  useEffect(() => {
    if (!assignedId) return
    Promise.all([
      supabase.from('assigned_workouts').select('*').eq('id', assignedId).single(),
      supabase.from('exercise_results').select('*').eq('assigned_workout_id', assignedId),
    ]).then(async ([{ data: a }, { data: res }]) => {
      setAssignment(a)
      setExistingResults(res ?? [])
      if (!a) { setLoaded(true); return }

      const { data: w } = await supabase.from('workouts').select('*').eq('id', a.workout_id).single()
      setWorkout(w)
      const { data: exs } = await supabase
        .from('exercises')
        .select('*, exercise_library:exercises_library(*)')
        .eq('workout_id', a.workout_id)
        .order('order')

      const list = exs ?? []
      setExercises(list)

      const saved = localStorage.getItem(storageKey(assignedId))
      if (saved) {
        try {
          const parsed: Record<string, ExerciseState> = JSON.parse(saved)
          if (list.every(ex => ex.id in parsed)) {
            setExState(parsed)
            setLoaded(true)
            return
          }
        } catch { /* fall through */ }
      }

      const initial: Record<string, ExerciseState> = {}
      for (const ex of list) {
        const existing = (res ?? []).find(r => r.exercise_id === ex.id)
        initial[ex.id] = {
          sets: Array.from({ length: ex.sets }, (_, i) => ({
            completed: i === 0 ? (existing?.completed ?? false) : false,
            reps: existing?.actual_reps != null ? String(existing.actual_reps) : String(ex.reps),
            weight: existing?.actual_weight_kg != null ? String(existing.actual_weight_kg) : String(ex.weight_kg),
          })),
          note: existing?.client_note ?? '',
          heartRate: existing?.actual_heart_rate_bpm != null ? String(existing.actual_heart_rate_bpm) : '',
        }
      }
      setExState(initial)
      setLoaded(true)
    })
  }, [assignedId])

  // Scroll to the exercise being timed when returning to this page
  useEffect(() => {
    if (timerActive && timerExerciseId && exercises.length > 0) {
      setTimeout(() => {
        document.getElementById(`exercise-${timerExerciseId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
    }
  }, [timerActive, timerExerciseId, exercises.length])

  function markSet(exId: string, setIdx: number) {
    const wasCompleted = exState[exId]?.sets[setIdx]?.completed
    setExState(prev => ({
      ...prev,
      [exId]: {
        ...prev[exId],
        sets: prev[exId].sets.map((s, i) => i === setIdx ? { ...s, completed: !s.completed } : s),
      },
    }))
    if (!wasCompleted && assignedId) {
      const restSec = exercises.find(e => e.id === exId)?.rest_sec ?? workout?.default_rest_sec ?? 90
      const currentSets = exState[exId]?.sets ?? []
      const otherSetsRemaining = currentSets.some((s, i) => i !== setIdx && !s.completed)
      let nextExName: string | null = null
      if (!otherSetsRemaining) {
        const currentIdx = exercises.findIndex(e => e.id === exId)
        nextExName = exercises[currentIdx + 1]?.exercise_library.name_ru ?? null
      }
      startTimer(restSec, nextExName, assignedId, exId)
    }
  }

  function updateSet(exId: string, setIdx: number, field: 'reps' | 'weight', val: string) {
    setExState(prev => ({
      ...prev,
      [exId]: {
        ...prev[exId],
        sets: prev[exId].sets.map((s, i) => i === setIdx ? { ...s, [field]: val } : s),
      },
    }))
  }

  function updateNote(exId: string, note: string) {
    setExState(prev => ({ ...prev, [exId]: { ...prev[exId], note } }))
  }

  function updateHeartRate(exId: string, heartRate: string) {
    setExState(prev => ({ ...prev, [exId]: { ...prev[exId], heartRate } }))
  }

  async function handleFinish() {
    if (!assignment || !profile) return
    setSaving(true)
    setError('')

    for (const ex of exercises) {
      const st = exState[ex.id]
      if (!st) continue
      const lastCompleted = st.sets.filter(s => s.completed).at(-1)
      const completed = st.sets.some(s => s.completed)
      const existing = existingResults.find(r => r.exercise_id === ex.id)
      const payload = {
        assigned_workout_id: assignment.id,
        exercise_id: ex.id,
        actual_reps: lastCompleted ? (parseInt(lastCompleted.reps) || null) : null,
        actual_weight_kg: lastCompleted ? (parseFloat(lastCompleted.weight) || null) : null,
        completed,
        client_note: st.note || null,
        actual_heart_rate_bpm: st.heartRate ? (parseInt(st.heartRate) || null) : null,
      }
      if (existing) {
        await supabase.from('exercise_results').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('exercise_results').insert(payload)
      }
    }

    const { error: updateErr } = await supabase.from('assigned_workouts').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', assignment.id)

    if (updateErr) { setError(updateErr.message); setSaving(false); return }

    if (assignedId) localStorage.removeItem(storageKey(assignedId))
    skipTimer()
    navigate('/client')
  }

  const ringOffset = timerTotal > 0 ? RING_C * (1 - timerSec / timerTotal) : 0

  // Three direct children of Layout (fullHeight):
  // 1. shrink-0 page header
  // 2. flex-1 min-h-0 scrollable exercises
  // 3. shrink-0 timer sheet (when active)
  return (
    <Layout fullHeight>

      {/* 1. Page header — fixed, not scrollable */}
      <div className="shrink-0 px-4 pt-4 pb-2 border-b border-slate-100">
        <Link to="/client" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Назад
        </Link>
        {workout && (
          <>
            <h1 className="text-xl font-semibold">{workout.name}</h1>
            <p className="text-xs text-slate-500 mt-0.5">Отдых по умолчанию: {workout.default_rest_sec} сек</p>
          </>
        )}
        {error && <ErrorMessage text={error} />}
      </div>

      {/* 2. Scrollable exercises area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {!loaded ? (
          <div className="text-center py-12 text-slate-400">Загрузка...</div>
        ) : (
          <div className="space-y-4">
            {exercises.map((ex, idx) => {
              const st = exState[ex.id]
              if (!st) return null
              return (
                <div
                  id={`exercise-${ex.id}`}
                  key={ex.id}
                  className="bg-white border border-slate-200 rounded-xl p-4"
                >
                  <div className="mb-3">
                    <div className="font-medium">{idx + 1}. {ex.exercise_library.name_ru}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {ex.exercise_library.exercise_type === 'cardio_time'
                        ? `${ex.sets > 1 ? `${ex.sets} интервала · ` : ''}${ex.reps} мин${ex.weight_kg > 0 ? ` · ${ex.weight_kg} км` : ''}`
                        : ex.exercise_library.exercise_type === 'cardio_reps'
                          ? `${ex.sets} подхода · ${ex.reps} повт`
                          : `${ex.sets} подхода · ${ex.reps} повт · ${ex.weight_kg > 0 ? `${ex.weight_kg} кг` : 'вес не указан'}`
                      }
                    </div>
                    {ex.trainer_note && <div className="text-xs text-indigo-700 mt-1 italic">{ex.trainer_note}</div>}
                  </div>

                  <div className="space-y-2">
                    {st.sets.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <button
                          onClick={() => markSet(ex.id, i)}
                          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-medium shrink-0 transition-colors ${s.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-slate-400 hover:border-emerald-400'}`}
                        >
                          {s.completed ? '✓' : i + 1}
                        </button>
                        {ex.exercise_library.exercise_type === 'cardio_time' ? (
                          <>
                            <input type="text" inputMode="numeric" value={s.reps}
                              onChange={e => updateSet(ex.id, i, 'reps', e.target.value)}
                              onFocus={e => e.target.select()}
                              className="w-16 border border-slate-300 rounded px-2 py-1 text-sm text-center" placeholder="мин" />
                            <span className="text-slate-400 text-xs">мин</span>
                            <input type="text" inputMode="decimal" value={s.weight}
                              onChange={e => updateSet(ex.id, i, 'weight', e.target.value)}
                              onFocus={e => e.target.select()}
                              className="w-20 border border-slate-300 rounded px-2 py-1 text-sm text-center" placeholder="0" />
                            <span className="text-slate-400 text-xs">км</span>
                          </>
                        ) : (
                          <>
                            <input type="text" inputMode="numeric" value={s.reps}
                              onChange={e => updateSet(ex.id, i, 'reps', e.target.value)}
                              onFocus={e => e.target.select()}
                              className="w-16 border border-slate-300 rounded px-2 py-1 text-sm text-center" placeholder="повт" />
                            {ex.exercise_library.exercise_type !== 'cardio_reps' && (
                              <>
                                <span className="text-slate-400 text-sm">×</span>
                                <input type="text" inputMode="decimal" value={s.weight}
                                  onChange={e => updateSet(ex.id, i, 'weight', e.target.value)}
                                  onFocus={e => e.target.select()}
                                  className="w-20 border border-slate-300 rounded px-2 py-1 text-sm text-center" placeholder="кг" />
                                <span className="text-slate-400 text-xs">кг</span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {ex.exercise_library.exercise_type === 'cardio_time' && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-slate-500 shrink-0">Пульс (уд/мин)</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={st.heartRate}
                        onChange={e => updateHeartRate(ex.id, e.target.value)}
                        onFocus={e => e.target.select()}
                        placeholder={ex.target_heart_rate_bpm ? `цель: ${ex.target_heart_rate_bpm}` : 'не указан'}
                        className="w-24 border border-slate-300 rounded px-2 py-1 text-sm text-center"
                      />
                    </div>
                  )}
                  <div className="mt-2">
                    <input
                      type="text"
                      value={st.note}
                      onChange={e => updateNote(ex.id, e.target.value)}
                      placeholder="Комментарий..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600 placeholder-slate-300"
                    />
                  </div>
                </div>
              )
            })}

            <button
              onClick={() => {
                const total = exercises.length
                const done = exercises.filter(ex => exState[ex.id]?.sets.some(s => s.completed)).length
                if (done < total) { setConfirmInfo({ done, total }); setShowConfirm(true) }
                else handleFinish()
              }}
              disabled={saving}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl"
            >
              {saving ? 'Сохранение...' : '✓ Завершить тренировку'}
            </button>
            <div className="h-2" />
          </div>
        )}
      </div>

      {/* 3. Timer sheet — at bottom, shrink-0, no position:fixed */}
      {timerActive && (
        <div className="shrink-0 bg-white rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] flex flex-col items-center px-6 pb-6 pt-3">
          <div className="w-8 h-1 bg-slate-200 rounded-full mb-4" />

          <div className="relative w-24 h-24">
            <svg width="96" height="96" viewBox="0 0 80 80" className="-rotate-90">
              <circle cx="40" cy="40" r="35" fill="none" stroke="#f1f5f9" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="35"
                fill="none"
                stroke={timerPaused ? '#94a3b8' : '#10b981'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={ringOffset}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-900">
              {fmt(timerSec)}
            </div>
          </div>

          <div className="text-xs text-slate-400 tracking-widest uppercase mt-1 mb-1">отдых</div>

          {timerNextEx && (
            <div className="text-xs text-slate-400 mb-3">
              следующий: <span className="text-slate-600 font-medium">{timerNextEx}</span>
            </div>
          )}

          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => setSoundEnabled(e => !e)} className="p-2 text-slate-400 hover:text-slate-600">
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={() => addTime(30)}
              className="flex items-center gap-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 hover:border-emerald-400 text-slate-600"
            >
              <Plus className="w-3 h-3" /> 30 сек
            </button>
            <button
              onClick={togglePause}
              className="flex items-center gap-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 hover:border-emerald-400 text-slate-600"
            >
              {timerPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              {timerPaused ? 'Продолжить' : 'Пауза'}
            </button>
            <button
              onClick={skipTimer}
              className="flex items-center gap-1 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg px-3 py-1.5"
            >
              <SkipForward className="w-3 h-3" /> Пропустить
            </button>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 pb-8 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-lg mb-2">Завершить тренировку?</h3>
            <p className="text-sm text-slate-500 mb-6">
              Ты выполнил {confirmInfo.done} из {confirmInfo.total} упражнений.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 border border-slate-200 rounded-xl py-3 text-sm text-slate-600 hover:bg-slate-50">
                Продолжить
              </button>
              <button onClick={() => { setShowConfirm(false); handleFinish() }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 text-sm font-medium">
                Завершить
              </button>
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}
