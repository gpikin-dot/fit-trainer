import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTimer } from '../contexts/TimerContext'
import Layout from '../components/Layout'
import type { AssignedWorkout, Workout, Exercise, ExerciseLibrary, ExerciseResult, SessionExercise } from '../types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetState {
  completed: boolean
  reps: string
  weight: string
}

interface ExState {
  sets: SetState[]
  note: string
  skipped: boolean
}

function storageKey(id: string) { return `workout_progress_${id}` }

// Прототип ТЗ §4.5.4: SVG-таймер 110×110, r=44, strokeWidth=6
const TIMER_R = 44
const TIMER_CIRC = 2 * Math.PI * TIMER_R   // ≈ 276.46
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// ─── Component ───────────────────────────────────────────────────────────────

export default function DoWorkoutPage() {
  const { assignedId } = useParams<{ assignedId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()

  // Совместная тренировка: тренер открыл выполнение через
  // /trainer/workout-session/:assignedId (asTrainer: true в прототипе)
  const asTrainer = location.pathname.startsWith('/trainer/')
  const {
    timerSec, timerTotal, timerActive, timerNextEx, timerExerciseId,
    startTimer, addTime, skipTimer,
  } = useTimer()

  const [assignment, setAssignment] = useState<AssignedWorkout | null>(null)
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [exercises, setExercises] = useState<(Exercise & { exercise_library: ExerciseLibrary })[]>([])
  const [existingResults, setExistingResults] = useState<ExerciseResult[]>([])
  const [exState, setExState] = useState<Record<string, ExState>>({})
  const [loaded, setLoaded] = useState(false)
  const [activeExId, setActiveExId] = useState<string | null>(null)
  const [timerLabel, setTimerLabel] = useState('Отдых')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [showDoneModal, setShowDoneModal] = useState(false)
  const [doneStats, setDoneStats] = useState({ done: 0, total: 0, abovePlan: 0 })

  // Advance activeEx when timer stops (timer-driven auto-advance)
  const prevTimerActive = useRef(false)
  useEffect(() => {
    if (prevTimerActive.current && !timerActive && timerExerciseId) {
      // Timer just ended — activate next pending
      const idx = exercises.findIndex(e => e.id === timerExerciseId)
      const next = exercises.slice(idx + 1).find(e => {
        const st = exState[e.id]
        return st && !st.skipped && !st.sets.every(s => s.completed)
      })
      if (next) setActiveExId(next.id)
    }
    prevTimerActive.current = timerActive
  }, [timerActive])

  // Persist to localStorage
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
      if (!a) { setLoaded(true); return }
      setAssignment(a as AssignedWorkout)
      setExistingResults((res ?? []) as ExerciseResult[])

      const { data: w } = await supabase.from('workouts').select('*').eq('id', a.workout_id).single()
      setWorkout(w as Workout)

      // session_exercises (new) or exercises (legacy)
      const { data: ses } = await supabase
        .from('session_exercises')
        .select('*, exercise_library:exercises_library(*)')
        .eq('assigned_workout_id', assignedId)
        .order('order')

      let list: (Exercise & { exercise_library: ExerciseLibrary })[]
      if (ses && ses.length > 0) {
        list = ses.map((se: SessionExercise & { exercise_library: ExerciseLibrary }) => ({
          id: se.id, workout_id: a.workout_id,
          library_exercise_id: se.library_exercise_id,
          sets: se.sets, reps: se.reps, weight_kg: se.weight_kg,
          rest_sec: se.rest_sec, trainer_note: se.trainer_note,
          target_heart_rate_bpm: null, order: se.order,
          exercise_library: se.exercise_library,
        })) as (Exercise & { exercise_library: ExerciseLibrary })[]
      } else {
        const { data: exs } = await supabase
          .from('exercises').select('*, exercise_library:exercises_library(*)')
          .eq('workout_id', a.workout_id).order('order')
        list = (exs ?? []) as (Exercise & { exercise_library: ExerciseLibrary })[]
      }
      setExercises(list)

      // Restore from localStorage
      const saved = localStorage.getItem(storageKey(assignedId))
      if (saved) {
        try {
          const parsed: Record<string, ExState> = JSON.parse(saved)
          if (list.every(ex => ex.id in parsed)) {
            setExState(parsed)
            // First non-done exercise
            const first = list.find(ex => {
              const st = parsed[ex.id]
              return !st?.skipped && !st?.sets.every(s => s.completed)
            })
            setActiveExId(first?.id ?? null)
            setLoaded(true)
            return
          }
        } catch { /* fall through */ }
      }

      // Build initial state from results
      const initial: Record<string, ExState> = {}
      for (const ex of list) {
        const existing = (res ?? []).find((r: ExerciseResult) => r.exercise_id === ex.id)
        initial[ex.id] = {
          sets: Array.from({ length: ex.sets }, (_, i) => ({
            completed: i === 0 ? (existing?.completed ?? false) : false,
            reps: existing?.actual_reps != null ? String(existing.actual_reps) : String(ex.reps),
            weight: existing?.actual_weight_kg != null ? String(existing.actual_weight_kg) : String(ex.weight_kg),
          })),
          note: existing?.client_note ?? '',
          skipped: false,
        }
      }
      setExState(initial)
      setActiveExId(list[0]?.id ?? null)
      setLoaded(true)
    })
  }, [assignedId])

  // ─── Actions ───────────────────────────────────────────────────────────────

  function markSet(exId: string, setIdx: number) {
    const wasCompleted = exState[exId]?.sets[setIdx]?.completed
    const newSets = exState[exId].sets.map((s, i) =>
      i === setIdx ? { ...s, completed: !s.completed } : s
    )
    setExState(prev => ({ ...prev, [exId]: { ...prev[exId], sets: newSets } }))

    if (!wasCompleted && assignedId) {
      const ex = exercises.find(e => e.id === exId)!
      const restSec = ex.rest_sec ?? workout?.default_rest_sec ?? 90
      const allDone = newSets.every(s => s.completed)
      const nextEx = allDone
        ? exercises[exercises.findIndex(e => e.id === exId) + 1]
        : null
      setTimerLabel(`Отдых после подхода ${setIdx + 1} / ${newSets.length}`)
      startTimer(restSec, nextEx?.exercise_library.name_ru ?? null, assignedId, exId)

      // Collapse done exercise — timer-driven advance handles setActiveExId
    }
  }

  function addSet(exId: string) {
    setExState(prev => {
      const st = prev[exId]
      const last = st.sets[st.sets.length - 1]
      return {
        ...prev,
        [exId]: {
          ...st,
          sets: [...st.sets, { completed: false, reps: last?.reps ?? '10', weight: last?.weight ?? '0' }],
        },
      }
    })
  }

  function skipExercise(exId: string) {
    setExState(prev => ({ ...prev, [exId]: { ...prev[exId], skipped: true } }))
    const idx = exercises.findIndex(e => e.id === exId)
    const next = exercises.slice(idx + 1).find(e => {
      const st = exState[e.id]
      return !st?.skipped && !st?.sets.every(s => s.completed)
    })
    setActiveExId(next?.id ?? null)
  }

  // Кликнули на done-карточку → возвращаем в active, сбрасываем галочки
  function reopenExercise(exId: string) {
    setExState(prev => ({
      ...prev,
      [exId]: {
        ...prev[exId],
        sets: prev[exId].sets.map(s => ({ ...s, completed: false })),
        skipped: false,
      },
    }))
    setActiveExId(exId)
    skipTimer()
  }

  // Кликнули на skipped-карточку → возвращаем в idle
  function unskipExercise(exId: string) {
    setExState(prev => ({ ...prev, [exId]: { ...prev[exId], skipped: false } }))
    setActiveExId(exId)
  }

  function updateSet(exId: string, idx: number, field: 'reps' | 'weight', val: string) {
    setExState(prev => ({
      ...prev,
      [exId]: {
        ...prev[exId],
        sets: prev[exId].sets.map((s, i) => i === idx ? { ...s, [field]: val } : s),
      },
    }))
  }

  function updateNote(exId: string, note: string) {
    setExState(prev => ({ ...prev, [exId]: { ...prev[exId], note } }))
  }

  async function handleFinish() {
    if (!assignment || !profile) return
    setSaving(true)
    setError('')

    let doneCnt = 0
    let abovePlan = 0

    for (const ex of exercises) {
      const st = exState[ex.id]
      if (!st) continue
      const lastDone = st.sets.filter(s => s.completed).at(-1)
      const completed = st.sets.some(s => s.completed)
      if (completed) doneCnt++

      const actualReps = lastDone ? (parseInt(lastDone.reps) || null) : null
      const actualWeight = lastDone ? (parseFloat(lastDone.weight) || null) : null
      if (actualReps && actualReps > ex.reps) abovePlan++
      else if (actualWeight && ex.weight_kg > 0 && actualWeight > ex.weight_kg) abovePlan++

      const existing = existingResults.find(r => r.exercise_id === ex.id)
      const payload = {
        assigned_workout_id: assignment.id,
        exercise_id: ex.id,
        actual_reps: actualReps,
        actual_weight_kg: actualWeight,
        completed,
        client_note: st.note || null,
        actual_heart_rate_bpm: null,
      }
      if (existing) {
        await supabase.from('exercise_results').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('exercise_results').insert(payload)
      }
    }

    const { error: updateErr } = await supabase
      .from('assigned_workouts')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', assignment.id)

    if (updateErr) { setError(updateErr.message); setSaving(false); return }

    if (assignedId) localStorage.removeItem(storageKey(assignedId))
    skipTimer()
    setDoneStats({ done: doneCnt, total: exercises.length, abovePlan })
    setSaving(false)
    setShowDoneModal(true)
  }

  function onFinishPress() {
    const total = exercises.length
    const done = exercises.filter(ex => exState[ex.id]?.sets.some(s => s.completed)).length
    if (done < total) setShowConfirm(true)
    else handleFinish()
  }

  // ─── Derived ───────────────────────────────────────────────────────────────

  const completedExCount = exercises.filter(ex => exState[ex.id]?.sets.every(s => s.completed)).length
  const progressPct = exercises.length > 0 ? Math.round(completedExCount / exercises.length * 100) : 0
  const timerProgress = timerTotal > 0 ? timerSec / timerTotal : 0
  const timerDash = TIMER_CIRC * timerProgress
  const timerGap = TIMER_CIRC - timerDash
  const timerExpired = timerActive && timerSec === 0

  const completedAtStr = assignment?.completed_at
    ? new Date(assignment.completed_at).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
    : null

  // Куда уходить ПОСЛЕ завершения тренировки (кнопка «Готово»):
  // тренер → карточка клиента, клиент → его дашборд
  const exitTo = asTrainer && assignment?.client_id
    ? `/trainer/client/${assignment.client_id}`
    : '/client'

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!loaded) return (
    <Layout>
      <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 17, color: 'var(--slate-400)' }}>
        Загрузка...
      </div>
    </Layout>
  )

  return (
    <Layout fullHeight>

      {/* ── Sticky Header ─────────────────────────────────── */}
      <div
        className="shrink-0"
        style={{ background: 'var(--white)', padding: '11px 13px 10px', borderBottom: '1px solid var(--border-light)' }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{ fontSize: 16, fontWeight: 600, color: 'var(--indigo-500)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 7, display: 'block', fontFamily: 'var(--font)' }}
        >
          ← Назад
        </button>
        {asTrainer && (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Совместная тренировка
          </div>
        )}
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--slate-900)', letterSpacing: '-0.01em', marginBottom: 7 }}>
          {workout?.name}
        </div>
        {error && (
          <div style={{ fontSize: 15, color: 'var(--red-600)', marginBottom: 5 }}>{error}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 15, color: 'var(--slate-400)' }}>Упражнений</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--indigo-500)' }}>
            {completedExCount} / {exercises.length}
          </span>
        </div>
        <div style={{ height: 3, background: 'var(--slate-100)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, background: 'var(--indigo-500)', width: `${progressPct}%`, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* ── Exercise List ──────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '11px 13px 0' }}>

        {exercises.map(ex => {
          const st = exState[ex.id]
          if (!st) return null
          const allDone = st.sets.length > 0 && st.sets.every(s => s.completed)
          const isActive = !allDone && !st.skipped && activeExId === ex.id
          const isDone = allDone && !st.skipped
          const isSkipped = st.skipped

          const name = ex.exercise_library.name_ru ?? ex.exercise_library.name_en ?? '—'
          const plan = `план: ${ex.sets} × ${ex.reps}${ex.weight_kg > 0 ? ` · ${ex.weight_kg} кг` : ''}`

          // ── Done card (clickable → reopen) ─────────────
          if (isDone) {
            const summary = st.sets
              .map((s, i) => `п.${i + 1}: ${s.reps}×${s.weight}кг`)
              .join('  ')
            return (
              <div
                key={ex.id}
                onClick={() => reopenExercise(ex.id)}
                style={{
                  background: 'var(--green-50)',
                  border: '1px solid var(--green-200)',
                  borderRadius: 10,
                  padding: '10px 11px',
                  marginBottom: 6,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--slate-900)' }}>{name}</span>
                  <span style={{ fontSize: 13, color: 'var(--slate-400)', whiteSpace: 'nowrap' }}>
                    Изменить ›
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--green-700)', fontWeight: 600, marginBottom: 4 }}>
                  ✓ {st.sets.filter(s => s.completed).length} подходов выполнено
                </div>
                <div style={{ fontSize: 14, color: 'var(--slate-700)', lineHeight: 1.6 }}>{summary}</div>
              </div>
            )
          }

          // ── Skipped card (clickable → unskip) ─────────
          if (isSkipped) {
            return (
              <div
                key={ex.id}
                onClick={() => unskipExercise(ex.id)}
                style={{
                  background: 'var(--slate-100)',
                  border: '1px solid var(--slate-200)',
                  borderRadius: 10, padding: '10px 11px', marginBottom: 6, opacity: 0.7,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--slate-400)' }}>{name}</div>
                    <div style={{ fontSize: 13, color: 'var(--slate-400)', marginTop: 2 }}>Пропущено</div>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--slate-500)', whiteSpace: 'nowrap' }}>
                    Вернуть ›
                  </span>
                </div>
              </div>
            )
          }

          // ── Active card ────────────────────────────────
          if (isActive) {
            return (
              <div key={ex.id} style={{
                background: 'var(--white)', border: '1px solid var(--indigo-300)',
                borderRadius: 10, padding: '10px 11px', marginBottom: 6,
              }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--slate-900)', marginBottom: 4 }}>{name}</div>
                <div style={{ fontSize: 15, color: 'var(--slate-400)', marginBottom: 8 }}>{plan}</div>

                {/* Sets table header — прототип ТЗ §4.5.3: grid 18px 1fr 1fr 34px */}
                <div style={{ display: 'grid', gridTemplateColumns: '18px 1fr 1fr 34px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <span />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate-400)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Повторы</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate-400)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Вес, кг</span>
                  <span />
                </div>

                {/* Set rows */}
                {st.sets.map((s, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '18px 1fr 1fr 34px',
                    gap: 6, alignItems: 'center', padding: '6px 0',
                    borderBottom: i < st.sets.length - 1 ? '1px solid var(--slate-100)' : 'none',
                    opacity: s.completed ? 0.55 : 1,
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--slate-400)', textAlign: 'center' }}>{i + 1}</span>
                    <input
                      type="text" inputMode="numeric" value={s.reps}
                      onChange={e => updateSet(ex.id, i, 'reps', e.target.value)}
                      onFocus={e => e.target.select()}
                      readOnly={s.completed}
                      style={{
                        width: '100%', padding: '7px 4px', textAlign: 'center',
                        fontSize: 16, fontWeight: 600, borderRadius: 8,
                        border: '1.5px solid var(--slate-200)', boxSizing: 'border-box',
                        background: '#fff', color: 'var(--slate-900)', fontFamily: 'var(--font)',
                      }}
                    />
                    <input
                      type="text" inputMode="decimal" value={s.weight}
                      onChange={e => updateSet(ex.id, i, 'weight', e.target.value)}
                      onFocus={e => e.target.select()}
                      readOnly={s.completed}
                      style={{
                        width: '100%', padding: '7px 4px', textAlign: 'center',
                        fontSize: 16, fontWeight: 600, borderRadius: 8,
                        border: '1.5px solid var(--slate-200)', boxSizing: 'border-box',
                        background: '#fff', color: 'var(--slate-900)', fontFamily: 'var(--font)',
                      }}
                    />
                    {/* Set-check — прототип ТЗ §4.5.3: круг 34×34, blue-600 при done */}
                    <button
                      onClick={() => !s.completed && markSet(ex.id, i)}
                      style={{
                        width: 34, height: 34, borderRadius: '50%',
                        border: s.completed ? '2px solid var(--blue-600)' : '2px solid var(--slate-300)',
                        background: s.completed ? 'var(--blue-600)' : '#fff',
                        color: s.completed ? '#fff' : 'var(--slate-300)',
                        fontSize: 15, fontWeight: 600,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: s.completed ? 'default' : 'pointer',
                        flexShrink: 0, padding: 0, fontFamily: 'var(--font)',
                        transition: 'background .15s, border-color .15s, color .15s',
                      }}
                    >
                      ✓
                    </button>
                  </div>
                ))}

                {/* Note */}
                <input
                  type="text"
                  value={st.note}
                  onChange={e => updateNote(ex.id, e.target.value)}
                  placeholder="Заметка (необязательно)..."
                  style={{
                    width: '100%', border: '1px solid var(--slate-200)', borderRadius: 6,
                    padding: '5px 8px', fontSize: 15, color: 'var(--slate-600)',
                    background: 'var(--slate-50)', marginTop: 7, fontStyle: 'italic',
                    fontFamily: 'var(--font)',
                  }}
                />

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <button onClick={() => addSet(ex.id)} style={{ fontSize: 15, fontWeight: 700, color: 'var(--indigo-500)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    + подход
                  </button>
                  <button onClick={() => skipExercise(ex.id)} style={{ fontSize: 15, color: 'var(--slate-400)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    Пропустить упражнение
                  </button>
                </div>
              </div>
            )
          }

          // ── Pending card ───────────────────────────────
          return (
            <div key={ex.id} style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 11px', marginBottom: 6, cursor: 'pointer',
            }}
              onClick={() => setActiveExId(ex.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--slate-900)' }}>{name}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--indigo-500)', flexShrink: 0 }}>Начать →</span>
              </div>
              <div style={{ fontSize: 15, color: 'var(--slate-400)' }}>{plan}</div>
            </div>
          )
        })}

        {/* Bottom padding so last card not hidden behind sticky button */}
        <div style={{ height: 80 }} />
      </div>

      {/* ── Timer Sheet — прототип ТЗ §4.5.4 ────────────── */}
      {timerActive && (
        <div className="shrink-0" style={{
          margin: '10px 16px 14px',
          padding: '16px 14px',
          background: timerExpired ? '#FEF2F2' : '#F0FDF4',
          border: `1px solid ${timerExpired ? '#FCA5A5' : '#BBF7D0'}`,
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}>
          {/* Label «ОТДЫХ» */}
          <div style={{
            fontSize: 11, fontWeight: 600,
            color: timerExpired ? 'var(--red-500)' : 'var(--green-600)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            {timerExpired ? 'ВРЕМЯ ВЫШЛО' : 'ОТДЫХ'}
          </div>

          {/* SVG-ring 110×110 */}
          <div style={{ position: 'relative', width: 110, height: 110 }}>
            <svg width="110" height="110" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="55" cy="55" r={TIMER_R} fill="none" stroke="#D1FAE5" strokeWidth="6" />
              <circle
                cx="55" cy="55" r={TIMER_R} fill="none"
                stroke={timerExpired ? 'var(--red-500)' : 'var(--green-600)'}
                strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${timerDash} ${timerGap}`}
                strokeDashoffset="0"
                style={{ transition: 'stroke-dasharray 1s linear' }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                fontSize: 32, fontWeight: 700, lineHeight: 1,
                color: timerExpired ? 'var(--red-500)' : 'var(--green-600)',
              }}>
                {fmt(timerSec)}
              </div>
              <div style={{
                fontSize: 10, marginTop: 2,
                color: timerExpired ? 'var(--red-500)' : 'var(--green-600)',
                opacity: 0.6,
              }}>
                сек
              </div>
            </div>
          </div>

          {timerNextEx && !timerExpired && (
            <div style={{ fontSize: 13, color: 'var(--slate-500)', textAlign: 'center' }}>
              следующее: {timerNextEx}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => skipTimer()}
              style={{
                background: '#fff', border: '1.5px solid var(--slate-200)',
                color: 'var(--slate-600)', borderRadius: 8,
                padding: '6px 12px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              Пропустить
            </button>
            <button
              onClick={() => addTime(30)}
              style={{
                background: '#fff', border: '1.5px solid #A7F3D0',
                color: 'var(--green-600)', borderRadius: 8,
                padding: '6px 12px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              +30 сек
            </button>
          </div>

          {/* Hidden, but keep timerLabel reachable for future debugging */}
          <span hidden>{timerLabel}</span>
        </div>
      )}

      {/* ── Sticky Finish Button ───────────────────────────── */}
      {!timerActive && (
        <div className="shrink-0" style={{ background: 'var(--white)', borderTop: '1px solid var(--border)', padding: '10px 13px 14px' }}>
          <button
            onClick={onFinishPress}
            disabled={saving}
            style={{
              width: '100%', background: 'var(--indigo-500)', color: 'var(--white)',
              border: 'none', borderRadius: 9, padding: 10,
              fontSize: 17, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1, fontFamily: 'var(--font)', letterSpacing: '0.01em',
            }}
          >
            {saving ? 'Сохранение...' : 'Завершить тренировку'}
          </button>
        </div>
      )}

      {/* ── Confirm Dialog ─────────────────────────────────── */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.3)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div style={{ background: 'var(--white)', borderRadius: '16px 16px 0 0', padding: '18px 16px 22px', width: '100%', maxWidth: 390, margin: '0 auto' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--slate-900)', marginBottom: 4 }}>Завершить тренировку?</div>
            <div style={{ fontSize: 15, color: 'var(--slate-500)', lineHeight: 1.5, marginBottom: 12 }}>
              Выполнено {exercises.filter(ex => exState[ex.id]?.sets.some(s => s.completed)).length} из {exercises.length} упражнений. Оставшиеся будут отмечены как пропущенные.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => { setShowConfirm(false); handleFinish() }}
                style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--red-200)', color: 'var(--red-500)', borderRadius: 9, padding: 10, fontSize: 17, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Да, завершить
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                style={{ width: '100%', background: 'var(--slate-50)', border: '1px solid var(--slate-200)', color: 'var(--slate-500)', borderRadius: 9, padding: 9, fontSize: 17, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Продолжить тренировку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Completion Modal ────────────────────────────────── */}
      {showDoneModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.3)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div style={{ background: 'var(--white)', borderRadius: '16px 16px 0 0', padding: '22px 16px 26px', width: '100%', maxWidth: 390, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--slate-900)', marginBottom: 3 }}>Тренировка завершена!</div>
            <div style={{ fontSize: 16, color: 'var(--slate-500)', marginBottom: 14 }}>
              {workout?.name} · {completedAtStr ?? new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long' })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 22, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--slate-900)', lineHeight: 1 }}>
                  {doneStats.done}/{doneStats.total}
                </div>
                <div style={{ fontSize: 15, color: 'var(--slate-400)', marginTop: 2 }}>упражнений</div>
              </div>
              {doneStats.abovePlan > 0 && (
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--indigo-500)', lineHeight: 1 }}>
                    +{doneStats.abovePlan}
                  </div>
                  <div style={{ fontSize: 15, color: 'var(--slate-400)', marginTop: 2 }}>выше плана</div>
                </div>
              )}
            </div>
            <button
              onClick={() => navigate(exitTo)}
              style={{ width: '100%', background: 'var(--indigo-500)', color: 'var(--white)', border: 'none', borderRadius: 9, padding: 10, fontSize: 17, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', letterSpacing: '0.01em' }}
            >
              Готово
            </button>
          </div>
        </div>
      )}

    </Layout>
  )
}
