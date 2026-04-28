import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Volume2, VolumeX, SkipForward, Plus, Pause, Play, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTimer } from '../contexts/TimerContext'
import Layout from '../components/Layout'
import { ErrorMessage } from '../components/UI'
import type { AssignedWorkout, Workout, Exercise, ExerciseLibrary, ExerciseResult, SessionExercise } from '../types/database'

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
  const [currentExIdx, setCurrentExIdx] = useState(0)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmInfo, setConfirmInfo] = useState({ done: 0, total: 0 })

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  // Persist progress to localStorage
  useEffect(() => {
    if (assignedId && Object.keys(exState).length > 0) {
      localStorage.setItem(storageKey(assignedId), JSON.stringify(exState))
    }
  }, [exState, assignedId])

  // Load data
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

      // Сначала пробуем session_exercises (новые назначения через AssignWorkoutFlow)
      const { data: sessionExs } = await supabase
        .from('session_exercises')
        .select('*, exercise_library:exercises_library(*)')
        .eq('assigned_workout_id', assignedId)
        .order('order')

      let list: (Exercise & { exercise_library: ExerciseLibrary })[]
      if (sessionExs && sessionExs.length > 0) {
        // Преобразуем SessionExercise → Exercise-совместимый формат
        list = sessionExs.map((se: SessionExercise & { exercise_library: ExerciseLibrary }) => ({
          id: se.id,
          workout_id: a.workout_id,
          library_exercise_id: se.library_exercise_id,
          sets: se.sets,
          reps: se.reps,
          weight_kg: se.weight_kg,
          rest_sec: se.rest_sec,
          trainer_note: se.trainer_note,
          target_heart_rate_bpm: null,
          order: se.order,
          exercise_library: se.exercise_library,
        })) as (Exercise & { exercise_library: ExerciseLibrary })[]
      } else {
        // Старые назначения — читаем из exercises
        const { data: exs } = await supabase
          .from('exercises')
          .select('*, exercise_library:exercises_library(*)')
          .eq('workout_id', a.workout_id)
          .order('order')
        list = exs ?? []
      }
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

  // Navigate to the exercise being timed
  useEffect(() => {
    if (timerExerciseId && exercises.length > 0) {
      const idx = exercises.findIndex(e => e.id === timerExerciseId)
      if (idx >= 0) setCurrentExIdx(idx)
    }
  }, [timerExerciseId, exercises.length])

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > Math.abs(dy) + 10 && Math.abs(dx) > 50) {
      if (dx < 0 && currentExIdx < exercises.length - 1) setCurrentExIdx(i => i + 1)
      if (dx > 0 && currentExIdx > 0) setCurrentExIdx(i => i - 1)
    }
    touchStartX.current = null
    touchStartY.current = null
  }

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
    navigate(`/client/session/${assignment.id}`)
  }

  const ringOffset = timerTotal > 0 ? RING_C * (1 - timerSec / timerTotal) : 0

  const isReadOnly = assignment?.status === 'completed'

  const currentEx = exercises[currentExIdx]
  const currentSt = currentEx ? exState[currentEx.id] : null
  const currentSetIdx = currentSt ? currentSt.sets.findIndex(s => !s.completed) : -1
  const allSetsThisExDone = currentSetIdx === -1

  const isLastExercise = currentExIdx === exercises.length - 1

  const completedDateStr = assignment?.completed_at
    ? new Date(assignment.completed_at).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
    : null

  return (
    <Layout fullHeight>

      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <Link to="/client" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" /> Назад
          </Link>
          {isReadOnly ? (
            <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">
              ✓ {completedDateStr}
            </span>
          ) : (
            exercises.length > 0 && (
              <span className="text-xs text-slate-400 font-medium">
                {currentExIdx + 1} из {exercises.length}
              </span>
            )
          )}
        </div>
        {workout && <h1 className="text-base font-semibold truncate">{workout.name}</h1>}
        {error && <ErrorMessage text={error} />}

        {/* Progress segments */}
        {exercises.length > 0 && (
          <div className="flex gap-1 mt-2">
            {exercises.map((ex, i) => {
              const done = exState[ex.id]?.sets.some(s => s.completed)
              return (
                <button
                  key={ex.id}
                  onClick={() => setCurrentExIdx(i)}
                  className={`h-1.5 rounded-full flex-1 transition-colors ${
                    i === currentExIdx ? 'bg-slate-800' :
                    done ? 'bg-emerald-400' : 'bg-slate-200'
                  }`}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Carousel */}
      {!loaded ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">Загрузка...</div>
      ) : (
        <div
          className="flex-1 min-h-0 overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="flex h-full transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${-currentExIdx * 100}%)` }}
          >
            {exercises.map((ex) => {
              const st = exState[ex.id]
              if (!st) return <div key={ex.id} className="w-full h-full shrink-0" />
              const thisSetIdx = st.sets.findIndex(s => !s.completed)

              return (
                <div key={ex.id} className="w-full h-full shrink-0 overflow-y-auto px-4 py-4">

                  {/* Exercise title */}
                  <div className="mb-4">
                    <h2 className="text-xl font-semibold leading-tight">{ex.exercise_library.name_ru}</h2>
                    <div className="text-sm text-slate-400 mt-0.5">
                      {ex.exercise_library.exercise_type === 'cardio_time'
                        ? `${ex.sets > 1 ? `${ex.sets} интервала · ` : ''}${ex.reps} мин${ex.weight_kg > 0 ? ` · ${ex.weight_kg} км` : ''}`
                        : ex.exercise_library.exercise_type === 'cardio_reps'
                          ? `${ex.sets} подхода · ${ex.reps} повт`
                          : `${ex.sets} подхода · ${ex.reps} повт${ex.weight_kg > 0 ? ` · ${ex.weight_kg} кг` : ''}`
                      }
                    </div>
                    {ex.trainer_note && (
                      <div className="text-xs text-indigo-700 mt-2 italic bg-indigo-50 px-3 py-2 rounded-xl">
                        {ex.trainer_note}
                      </div>
                    )}
                  </div>

                  {/* Sets */}
                  <div className="space-y-2">
                    {st.sets.map((s, i) => {
                      const isCurrentSet = !isReadOnly && i === thisSetIdx
                      const showCompleted = isReadOnly || s.completed
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            showCompleted
                              ? 'bg-emerald-50 border-emerald-200'
                              : isCurrentSet
                                ? 'bg-white border-slate-800 shadow-sm'
                                : 'bg-white border-slate-200'
                          }`}
                        >
                          <button
                            onClick={() => !isReadOnly && markSet(ex.id, i)}
                            disabled={isReadOnly}
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors ${
                              showCompleted
                                ? 'bg-emerald-500 text-white'
                                : isCurrentSet
                                  ? 'bg-slate-800 text-white'
                                  : 'border border-slate-300 text-slate-400'
                            }`}
                          >
                            {showCompleted ? '✓' : i + 1}
                          </button>

                          {isReadOnly ? (
                            // Read-only: plain text
                            <span className="text-sm text-slate-700 font-medium">
                              {ex.exercise_library.exercise_type === 'cardio_time'
                                ? `${s.reps} мин${parseFloat(s.weight) > 0 ? ` · ${s.weight} км` : ''}`
                                : ex.exercise_library.exercise_type === 'cardio_reps'
                                  ? `${s.reps} повт`
                                  : `${s.reps} повт${parseFloat(s.weight) > 0 ? ` × ${s.weight} кг` : ''}`
                              }
                            </span>
                          ) : ex.exercise_library.exercise_type === 'cardio_time' ? (
                            <>
                              <input type="text" inputMode="numeric" value={s.reps}
                                onChange={e => updateSet(ex.id, i, 'reps', e.target.value)}
                                onFocus={e => e.target.select()}
                                className="w-14 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center" placeholder="мин" />
                              <span className="text-slate-400 text-xs">мин</span>
                              <input type="text" inputMode="decimal" value={s.weight}
                                onChange={e => updateSet(ex.id, i, 'weight', e.target.value)}
                                onFocus={e => e.target.select()}
                                className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center" placeholder="0" />
                              <span className="text-slate-400 text-xs">км</span>
                            </>
                          ) : (
                            <>
                              <input type="text" inputMode="numeric" value={s.reps}
                                onChange={e => updateSet(ex.id, i, 'reps', e.target.value)}
                                onFocus={e => e.target.select()}
                                className="w-14 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center" placeholder="повт" />
                              {ex.exercise_library.exercise_type !== 'cardio_reps' && (
                                <>
                                  <span className="text-slate-300 text-sm">×</span>
                                  <input type="text" inputMode="decimal" value={s.weight}
                                    onChange={e => updateSet(ex.id, i, 'weight', e.target.value)}
                                    onFocus={e => e.target.select()}
                                    className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center" placeholder="кг" />
                                  <span className="text-slate-400 text-xs">кг</span>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Heart rate for cardio */}
                  {ex.exercise_library.exercise_type === 'cardio_time' && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-slate-500 shrink-0">Пульс (уд/мин)</span>
                      {isReadOnly ? (
                        <span className="text-sm text-slate-700 font-medium">
                          {st.heartRate || '—'}
                        </span>
                      ) : (
                        <input
                          type="text"
                          inputMode="numeric"
                          value={st.heartRate}
                          onChange={e => updateHeartRate(ex.id, e.target.value)}
                          onFocus={e => e.target.select()}
                          placeholder={ex.target_heart_rate_bpm ? `цель: ${ex.target_heart_rate_bpm}` : 'не указан'}
                          className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center"
                        />
                      )}
                    </div>
                  )}

                  {/* Note */}
                  <div className="mt-3">
                    {isReadOnly ? (
                      st.note && (
                        <p className="text-sm text-slate-500 italic px-1">{st.note}</p>
                      )
                    ) : (
                      <input
                        type="text"
                        value={st.note}
                        onChange={e => updateNote(ex.id, e.target.value)}
                        placeholder="Комментарий..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 placeholder-slate-300"
                      />
                    )}
                  </div>

                  <div className="h-4" />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bottom action button */}
      {loaded && !timerActive && !isReadOnly && currentEx && (
        <div className="shrink-0 px-4 pb-safe-or-6 pt-3 bg-white border-t border-slate-100">
          <div className="pb-2">
            {allSetsThisExDone ? (
              isLastExercise ? (
                <button
                  onClick={() => {
                    const total = exercises.length
                    const done = exercises.filter(ex => exState[ex.id]?.sets.some(s => s.completed)).length
                    if (done < total) { setConfirmInfo({ done, total }); setShowConfirm(true) }
                    else handleFinish()
                  }}
                  disabled={saving}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-4 rounded-2xl text-base"
                >
                  {saving ? 'Сохранение...' : '✓ Завершить тренировку'}
                </button>
              ) : (
                <button
                  onClick={() => setCurrentExIdx(i => i + 1)}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-4 rounded-2xl text-base flex items-center justify-center gap-2"
                >
                  Следующее упражнение <ChevronRight className="w-5 h-5" />
                </button>
              )
            ) : (
              <button
                onClick={() => markSet(currentEx.id, currentSetIdx)}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-4 rounded-2xl text-base"
              >
                ✓ Подход {currentSetIdx + 1} выполнен
              </button>
            )}
          </div>
        </div>
      )}

      {/* Timer sheet */}
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
