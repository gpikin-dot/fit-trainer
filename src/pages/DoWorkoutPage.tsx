import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Timer, Volume2, VolumeX, SkipForward, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
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

export default function DoWorkoutPage() {
  const { assignedId } = useParams<{ assignedId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [assignment, setAssignment] = useState<AssignedWorkout | null>(null)
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [exercises, setExercises] = useState<(Exercise & { exercise_library: ExerciseLibrary })[]>([])
  const [existingResults, setExistingResults] = useState<ExerciseResult[]>([])
  const [exState, setExState] = useState<Record<string, ExerciseState>>({})

  const [timerSec, setTimerSec] = useState(0)
  const [timerActive, setTimerActive] = useState(false)
  const [timerPaused, setTimerPaused] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!assignedId) return
    Promise.all([
      supabase.from('assigned_workouts').select('*').eq('id', assignedId).single(),
      supabase.from('exercise_results').select('*').eq('assigned_workout_id', assignedId),
    ]).then(async ([{ data: a }, { data: res }]) => {
      setAssignment(a)
      setExistingResults(res ?? [])
      if (!a) return

      const { data: w } = await supabase.from('workouts').select('*').eq('id', a.workout_id).single()
      setWorkout(w)
      const { data: exs } = await supabase.from('exercises').select('*, exercise_library:exercises_library(*)').eq('workout_id', a.workout_id).order('order')

      const list = exs ?? []
      setExercises(list)

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
    })
  }, [assignedId])

  const playBeep = useCallback(() => {
    if (!soundEnabled) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch { /* ignore */ }
  }, [soundEnabled])

  useEffect(() => {
    if (timerActive && !timerPaused) {
      timerRef.current = setInterval(() => {
        setTimerSec(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!)
            setTimerActive(false)
            playBeep()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerActive, timerPaused, playBeep])

  function startTimer(secs: number) {
    setTimerSec(secs)
    setTimerActive(true)
    setTimerPaused(false)
  }

  function markSet(exId: string, setIdx: number) {
    const restSec = exercises.find(e => e.id === exId)?.rest_sec ?? workout?.default_rest_sec ?? 90
    setExState(prev => ({
      ...prev,
      [exId]: {
        ...prev[exId],
        sets: prev[exId].sets.map((s, i) => i === setIdx ? { ...s, completed: !s.completed } : s),
      },
    }))
    if (!exState[exId]?.sets[setIdx]?.completed) {
      startTimer(restSec)
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

    await supabase.from('assigned_workouts').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', assignment.id)

    navigate('/client')
  }

  if (!workout || exercises.length === 0) return (
    <Layout>
      <div className="text-center py-12 text-slate-400">Загрузка...</div>
    </Layout>
  )

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <Layout>
      <Link to="/client" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Назад
      </Link>
      <h1 className="text-2xl font-semibold mb-1">{workout.name}</h1>
      <p className="text-sm text-slate-500 mb-5">Отдых по умолчанию: {workout.default_rest_sec} сек</p>

      {error && <ErrorMessage text={error} />}

      <div className="space-y-4 mb-6">
        {exercises.map((ex, idx) => {
          const st = exState[ex.id]
          if (!st) return null
          return (
            <div key={ex.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
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
      </div>

      <button
        onClick={handleFinish}
        disabled={saving}
        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl mb-20"
      >
        {saving ? 'Сохранение...' : '✓ Завершить тренировку'}
      </button>

      {/* Rest timer — sticky bottom */}
      {timerActive && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg px-4 py-3 flex items-center justify-between z-40">
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-emerald-600" />
            <span className="text-xl font-mono font-semibold">{fmt(timerSec)}</span>
            <span className="text-sm text-slate-500">отдых</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSoundEnabled(e => !e)} className="text-slate-400 hover:text-slate-600">
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            <button onClick={() => setTimerSec(s => s + 30)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 hover:border-emerald-400 flex items-center gap-1">
              <Plus className="w-3 h-3" /> 30 сек
            </button>
            <button onClick={() => setTimerPaused(p => !p)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 hover:border-emerald-400">
              {timerPaused ? 'Продолжить' : 'Пауза'}
            </button>
            <button onClick={() => setTimerActive(false)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 hover:border-red-300 text-slate-500 flex items-center gap-1">
              <SkipForward className="w-3 h-3" /> Пропустить
            </button>
          </div>
        </div>
      )}
    </Layout>
  )
}
