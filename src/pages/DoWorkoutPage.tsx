import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTimer } from '../contexts/TimerContext'
import Layout from '../components/Layout'
import type { AssignedWorkout, Workout, Exercise, ExerciseLibrary, ExerciseResult, SessionExercise } from '../types/database'
import { clampActualReps, clampActualWeight } from '../lib/numeric'
import { modeOf } from '../lib/workoutMode'
import { plural } from '../lib/plural'
import { groupInfoFor, groupLabel } from '../lib/superset'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetState {
  completed: boolean
  reps: string
  weight: string
  at?: string | null // время отметки подхода (ISO)
}

interface ExState {
  sets: SetState[]
  note: string
  skipped: boolean
}

function storageKey(id: string) { return `workout_progress_${id}` }
function startedKey(id: string) { return `workout_started_${id}` }

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Общая длительность тренировки: после часа показываем часы
const fmtElapsed = (s: number) => s >= 3600
  ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  : fmt(s)

// Техника упражнения: два кадра (старт/финиш) из библиотеки,
// чередуем — получается простая анимация. Сворачивается тапом.
function ExerciseImage({ urls, name, defaultHidden = false }: { urls: string[]; name: string; defaultHidden?: boolean }) {
  const [frame, setFrame] = useState(0)
  const [hidden, setHidden] = useState(defaultHidden)
  useEffect(() => {
    if (urls.length < 2 || hidden) return
    const t = setInterval(() => setFrame(f => 1 - f), 900)
    return () => clearInterval(t)
  }, [urls.length, hidden])
  if (urls.length === 0) return null
  if (hidden) {
    return (
      <button onClick={() => setHidden(false)}
        style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate-400)', background: 'none', border: 'none', padding: '0 0 8px', cursor: 'pointer', fontFamily: 'var(--font)' }}>
        ⊕ показать технику
      </button>
    )
  }
  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <img
        src={urls[Math.min(frame, urls.length - 1)]}
        alt={`Техника: ${name}`}
        style={{ width: '100%', height: 150, objectFit: 'contain', background: '#fff', borderRadius: 8, border: '1px solid var(--slate-100)', filter: 'grayscale(1) contrast(1.05)' }}
      />
      <button onClick={() => setHidden(true)}
        style={{ position: 'absolute', top: 6, right: 6, fontSize: 11, fontWeight: 600, color: 'var(--slate-400)', background: 'rgba(255,255,255,0.9)', border: '1px solid var(--slate-200)', borderRadius: 12, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font)' }}>
        скрыть
      </button>
    </div>
  )
}

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
    timerSec, timerTotal, timerOvertime, timerActive, timerNextEx, timerExerciseId,
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
  // Превью перед выполнением: список упражнений + кнопка «Начать»
  const [phase, setPhase] = useState<'preview' | 'doing'>('preview')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [showDoneModal, setShowDoneModal] = useState(false)
  const [doneStats, setDoneStats] = useState({ done: 0, total: 0, abovePlan: 0 })

  // Свайп между упражнениями (фидбэк п.4)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  // Общий таймер тренировки: старт фиксируется в localStorage при первом
  // входе в выполнение и переживает перезагрузку страницы
  const [elapsedSec, setElapsedSec] = useState(0)
  useEffect(() => {
    if (phase !== 'doing' || !assignedId) return
    let started = parseInt(localStorage.getItem(startedKey(assignedId)) ?? '', 10)
    if (!started || Number.isNaN(started)) {
      started = Date.now()
      localStorage.setItem(startedKey(assignedId), String(started))
    }
    const update = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - started) / 1000)))
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [phase, assignedId])

  // Направление анимации смены карточки: сравниваем с прошлым индексом
  const curStepIdx = (() => {
    const i = exercises.findIndex(e => e.id === activeExId)
    return i >= 0 ? i : 0
  })()
  const prevStepIdxRef = useRef(curStepIdx)
  const slideDir = curStepIdx >= prevStepIdxRef.current ? 'fwd' : 'back'
  useEffect(() => { prevStepIdxRef.current = curStepIdx }, [curStepIdx])

  // Advance activeEx when timer stops (timer-driven auto-advance)
  const prevTimerActive = useRef(false)
  useEffect(() => {
    if (prevTimerActive.current && !timerActive && timerExerciseId) {
      // Таймер закончился/закрыт. Переходим к следующему упражнению
      // ТОЛЬКО если текущее логически завершено (все подходы отмечены
      // или оно пропущено). Иначе остаёмся на текущем — иначе кидало
      // на следующее даже когда подход не отмечен (фидбэк п.3).
      const curSt = exState[timerExerciseId]
      const curDone = !!curSt && (curSt.skipped || (curSt.sets.length > 0 && curSt.sets.every(s => s.completed)))
      if (curDone) {
        const idx = exercises.findIndex(e => e.id === timerExerciseId)
        const next = exercises.slice(idx + 1).find(e => {
          const st = exState[e.id]
          return st && !st.skipped && !st.sets.every(s => s.completed)
        })
        if (next) setActiveExId(next.id)
      } else {
        setActiveExId(timerExerciseId)
      }
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
          mode: modeOf(se.mode, se.exercise_library),
          superset_group: se.superset_group ?? null,
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
      i === setIdx ? { ...s, completed: !s.completed, at: !s.completed ? new Date().toISOString() : null } : s
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
    const nextIdx = Math.min(idx + 1, exercises.length - 1)
    setActiveExId(exercises[nextIdx]?.id ?? null)
  }

  // Вернуть пропущенное упражнение в работу
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

    // Тренировка уже завершена — не перезаписываем результаты заново
    // (вис/ошибка при повторном завершении, фидбэк п.6). Просто выходим.
    if (assignment.status === 'completed') {
      skipTimer()
      navigate(asTrainer && assignment.client_id
        ? `/trainer/client/${assignment.client_id}`
        : '/client')
      return
    }

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

      const actualReps = lastDone ? clampActualReps(parseInt(lastDone.reps) || null) : null
      const actualWeight = lastDone ? clampActualWeight(parseFloat(lastDone.weight) || null) : null
      if (actualReps && actualReps > ex.reps) abovePlan++
      else if (actualWeight && ex.weight_kg > 0 && actualWeight > ex.weight_kg) abovePlan++

      const actualSets = st.sets.map(s => ({
        reps: clampActualReps(parseInt(s.reps) || null),
        weight: clampActualWeight(parseFloat(s.weight) || null),
        completed: s.completed,
        at: s.at ?? null,
      }))

      const existing = existingResults.find(r => r.exercise_id === ex.id)
      const payload = {
        assigned_workout_id: assignment.id,
        exercise_id: ex.id,
        library_exercise_id: ex.library_exercise_id,
        actual_reps: actualReps,
        actual_weight_kg: actualWeight,
        actual_sets: actualSets,
        completed,
        client_note: st.note || null,
      }
      const { error: resErr } = existing
        ? await supabase.from('exercise_results').update(payload).eq('id', existing.id)
        : await supabase.from('exercise_results').insert(payload)
      // НЕ помечаем тренировку завершённой, если результаты не сохранились —
      // иначе потеря данных (раньше ошибка глоталась молча).
      if (resErr) {
        setError('Не удалось сохранить результаты: ' + resErr.message)
        setSaving(false)
        return
      }
    }

    const { error: updateErr } = await supabase
      .from('assigned_workouts')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', assignment.id)

    if (updateErr) { setError(updateErr.message); setSaving(false); return }

    if (assignedId) {
      localStorage.removeItem(storageKey(assignedId))
      localStorage.removeItem(startedKey(assignedId))
    }
    skipTimer()
    setDoneStats({ done: doneCnt, total: exercises.length, abovePlan })
    setSaving(false)
    setShowDoneModal(true)
  }

  function onFinishPress() {
    // Всегда подтверждаем — чтобы не завершить случайно при логировании
    setShowConfirm(true)
  }

  // Свайп: влево = следующее упражнение, вправо = предыдущее (п.4)
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = touchStart.current
    touchStart.current = null
    if (!s) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    // Горизонтальный жест, не вертикальный скролл
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    const idx = exercises.findIndex(ex => ex.id === activeExId)
    if (idx < 0) return
    if (dx < 0 && idx < exercises.length - 1) setActiveExId(exercises[idx + 1].id)
    else if (dx > 0 && idx > 0) setActiveExId(exercises[idx - 1].id)
  }

  // ─── Derived ───────────────────────────────────────────────────────────────

  const completedExCount = exercises.filter(ex => exState[ex.id]?.sets.every(s => s.completed)).length
  const progressPct = exercises.length > 0 ? Math.round(completedExCount / exercises.length * 100) : 0
  const timerProgress = timerTotal > 0 ? timerSec / timerTotal : 0
  // Овертайм: отдых вышел, считаем сколько секунд прошло сверх
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

  const hasProgress =
    existingResults.length > 0 ||
    Object.values(exState).some(st => st.sets.some(s => s.completed) || st.skipped)

  // ── Превью тренировки (до старта) ───────────────────────────
  if (phase === 'preview') {
    return (
      <Layout>
        <div className="pt-[11px] pb-[24px]">
          <button
            onClick={() => navigate(-1)}
            className="text-[14px] font-semibold text-[var(--blue-600)] mb-[10px]"
          >
            ← Назад
          </button>
          {asTrainer && (
            <div className="text-[12px] font-semibold text-[var(--blue-600)] uppercase tracking-[0.05em] mb-[4px]">
              Совместная тренировка
            </div>
          )}
          <h1 className="text-[20px] font-bold text-[var(--slate-900)] mb-[2px]">{workout?.name}</h1>
          <p className="text-[13px] text-[var(--slate-400)] mb-[12px]">
            {plural(exercises.length, 'упражнение', 'упражнения', 'упражнений')}
            {workout?.default_rest_sec ? ` · отдых ${workout.default_rest_sec} сек` : ''}
          </p>

          {/* Прогресс при возврате в прерванную тренировку (фидбэк п.7) */}
          {hasProgress && (
            <div className="bg-white border border-[var(--border)] rounded-[10px] px-[12px] py-[10px] mb-[12px]">
              <div className="flex items-baseline justify-between mb-[6px]">
                <span className="text-[13px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.06em]">
                  Прогресс
                </span>
                <span className="text-[15px] font-bold text-[var(--slate-900)]">
                  {completedExCount} / {exercises.length}
                </span>
              </div>
              <div className="h-[5px] bg-[var(--slate-100)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--green-300)]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {(() => {
            type Ex = typeof exercises[number]
            // Где тренировка прервана — первое незавершённое/непропущенное
            const resumeIdx = exercises.findIndex(ex => {
              const st = exState[ex.id]
              return !st?.skipped && !(st && st.sets.length > 0 && st.sets.every(s => s.completed))
            })

            const status = (ex: Ex, i: number) => {
              const st = exState[ex.id]
              const totalSets = st?.sets.length ?? ex.sets
              const doneSets = st?.sets.filter(s => s.completed).length ?? 0
              const isDone = !!st && !st.skipped && st.sets.length > 0 && st.sets.every(s => s.completed)
              const isSkipped = !!st?.skipped
              const isPartial = !isDone && !isSkipped && doneSets > 0
              const isResume = hasProgress && i === resumeIdx
              return { totalSets, doneSets, isDone, isSkipped, isPartial, isResume }
            }

            // Внутренности карточки упражнения (общие для одиночных и связок)
            const rowBody = (ex: Ex, i: number) => {
              const lib = ex.exercise_library
              const { totalSets, doneSets, isDone, isSkipped, isPartial, isResume } = status(ex, i)
              return (
                <>
                  <div className="flex items-start justify-between gap-[8px]">
                    <div className="text-[15px] font-semibold text-[var(--slate-900)] mb-[3px]">
                      {i + 1}. {lib.name_ru ?? lib.name_en}
                    </div>
                    {isDone && <span className="text-[13px] font-bold text-[var(--green-600)] shrink-0">✓ выполнено</span>}
                    {isSkipped && <span className="text-[13px] font-semibold text-[var(--slate-400)] shrink-0">пропущено</span>}
                    {isPartial && <span className="text-[13px] font-semibold text-[var(--amber-800)] shrink-0">{doneSets}/{totalSets} подх.</span>}
                    {isResume && !isDone && !isPartial && !isSkipped && (
                      <span className="text-[13px] font-bold text-[var(--blue-600)] shrink-0">продолжить →</span>
                    )}
                  </div>
                  <div className="text-[13px] text-[var(--slate-500)]">
                    {ex.mode === 'time'
                      ? `${ex.sets} × ${ex.reps} сек`
                      : ex.mode === 'reps'
                        ? `${ex.sets} × ${ex.reps}`
                        : `${ex.sets} × ${ex.reps}${ex.weight_kg > 0 ? ` · ${ex.weight_kg} кг` : ''}`}
                    {ex.rest_sec ? ` · отдых ${ex.rest_sec} сек` : ''}
                  </div>
                  {ex.trainer_note && (
                    <div className="text-[13px] text-[var(--blue-600)] italic mt-[3px]">«{ex.trainer_note}»</div>
                  )}
                </>
              )
            }

            // Группируем соседние упражнения одной связки в секции
            const sections: { group: number | null; items: number[] }[] = []
            exercises.forEach((ex, i) => {
              const g = ex.superset_group
              const last = sections[sections.length - 1]
              if (g != null && last && last.group === g) last.items.push(i)
              else sections.push({ group: g ?? null, items: [i] })
            })

            return sections.map((sec, si) => {
              // Одиночное упражнение (или «группа» из одного) — обычная карточка
              if (sec.group == null || sec.items.length < 2) {
                const i = sec.items[0]
                const ex = exercises[i]
                const { isDone, isResume } = status(ex, i)
                return (
                  <div
                    key={ex.id}
                    className={`bg-white rounded-[10px] px-[12px] py-[10px] mb-[5px] border ${
                      isResume ? 'border-[var(--blue-600)] border-[1.5px]' : 'border-[var(--border)]'
                    }`}
                    style={isDone ? { opacity: 0.55 } : undefined}
                  >
                    {rowBody(ex, i)}
                  </div>
                )
              }
              // Связка — единый зелёный блок с заголовком
              return (
                <div
                  key={`g${si}`}
                  className="rounded-[10px] mb-[5px] border-[1.5px] border-[var(--green-300)] bg-[var(--green-50)] overflow-hidden"
                >
                  <div className="px-[12px] pt-[8px] pb-[6px] flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[var(--green-700)] uppercase tracking-[0.06em]">
                      {groupLabel(sec.items.length)}
                    </span>
                    <span className="text-[11px] text-[var(--green-600)]">выполняется подряд</span>
                  </div>
                  <div className="px-[6px] pb-[6px] flex flex-col gap-[4px]">
                    {sec.items.map(i => {
                      const ex = exercises[i]
                      const { isDone } = status(ex, i)
                      return (
                        <div
                          key={ex.id}
                          className="bg-white rounded-[8px] px-[10px] py-[8px] border border-[var(--green-100)]"
                          style={isDone ? { opacity: 0.55 } : undefined}
                        >
                          {rowBody(ex, i)}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          })()}

          <button
            onClick={() => setPhase('doing')}
            className="w-full mt-[14px] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-[15px] font-semibold rounded-[10px] py-[14px]"
          >
            {hasProgress
              ? 'Продолжить тренировку'
              : asTrainer ? 'Начать совместную тренировку' : 'Начать тренировку'}
          </button>
        </div>
      </Layout>
    )
  }

  // Таймер отдыха — встроен в карточку текущего упражнения
  // (компактная строка + «убегающая» полоса), без отдельного экрана.
  const timerStr = timerExpired ? `+${fmt(timerOvertime)}` : fmt(timerSec)
  const restPct = timerExpired ? 100 : Math.max(2, Math.round(timerProgress * 100))

  // Текущее упражнение в пошаговом режиме (одно на экран, без прыжков)
  const stepIdx = (() => {
    const i = exercises.findIndex(e => e.id === activeExId)
    return i >= 0 ? i : 0
  })()
  const stepEx = exercises[stepIdx]
  const stepSt = stepEx ? exState[stepEx.id] : undefined

  return (
    <Layout fullHeight>

      {/* Скроллер страницы: рабочий экран помещается без скролла,
          кнопка «Завершить» спрятана ниже кромки — её достаёт скролл вниз */}
      <div className="flex-1 min-h-0 overflow-y-auto">

      {/* Экран: шапка + рабочая зона занимают высоту вьюпорта */}
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ─────────────────────────────────── */}
      <div
        style={{ background: 'var(--white)', padding: '9px 13px 8px', borderBottom: '1px solid var(--border-light)' }}
      >
        {/* Общий таймер тренировки — справа от «Назад» */}
        {elapsedSec > 0 && (
          <span style={{
            float: 'right', fontSize: 16, fontWeight: 600, color: 'var(--slate-500)',
            fontFeatureSettings: '"tnum"', letterSpacing: '0.01em',
          }}>
            ⏱ {fmtElapsed(elapsedSec)}
          </span>
        )}
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
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--slate-900)', letterSpacing: '-0.01em', marginBottom: 6 }}>
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

      {/* ── Рабочая зона: без своего скролла, контент ужат под экран ── */}
      <div
        className="flex-1"
        style={{ padding: '9px 13px 10px' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >

        {/* Степпер: чипы упражнений — обзор + быстрый переход без длинного скролла */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
          {exercises.map((ex, i) => {
            const s = exState[ex.id]
            const done = !!s && s.sets.length > 0 && s.sets.every(x => x.completed) && !s.skipped
            const skip = s?.skipped
            const cur = i === stepIdx
            return (
              <button
                key={ex.id}
                onClick={() => setActiveExId(ex.id)}
                title={ex.exercise_library.name_ru ?? ex.exercise_library.name_en ?? ''}
                style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                  border: cur ? '2px solid var(--blue-600)' : '1.5px solid var(--slate-200)',
                  background: done ? 'var(--green-600)' : skip ? 'var(--slate-200)' : '#fff',
                  color: done ? '#fff' : cur ? 'var(--blue-600)' : 'var(--slate-500)',
                }}
              >
                {done ? '✓' : i + 1}
              </button>
            )
          })}
        </div>

        {stepEx && stepSt && (() => {
          const ex = stepEx
          const st = stepSt
          const name = ex.exercise_library.name_ru ?? ex.exercise_library.name_en ?? '—'
          const plan = ex.mode === 'time'
            ? `план: ${ex.sets} × ${ex.reps} сек`
            : ex.mode === 'reps'
              ? `план: ${ex.sets} × ${ex.reps}`
              : `план: ${ex.sets} × ${ex.reps}${ex.weight_kg > 0 ? ` · ${ex.weight_kg} кг` : ''}`
          const allDone = st.sets.length > 0 && st.sets.every(s => s.completed)
          const m = modeOf(ex.mode, ex.exercise_library)
          const cols = m === 'weight' ? '18px 1fr 1fr 34px' : '18px 1fr 34px'
          const lblCol2 = m === 'time' ? 'Секунды' : 'Повторы'
          const borderColor = timerActive ? 'var(--ink)' : st.skipped ? 'var(--slate-200)' : allDone ? 'var(--green-300)' : 'var(--blue-400)'

          const checkBtn = (s: SetState, i: number) => (
            <button
              onClick={() => markSet(ex.id, i)}
              title={s.completed ? 'Снять отметку' : 'Отметить подход'}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                border: s.completed ? '2px solid var(--green-600)' : '2px solid var(--slate-300)',
                background: s.completed ? 'var(--green-600)' : '#fff',
                color: s.completed ? '#fff' : 'var(--slate-300)',
                fontSize: 15, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, padding: 0, fontFamily: 'var(--font)',
                transition: 'background .15s, border-color .15s, color .15s',
              }}
            >✓</button>
          )
          const numCell = (val: string, field: 'reps' | 'weight', s: SetState, i: number) => (
            <input
              type="text" inputMode={field === 'weight' ? 'decimal' : 'numeric'} value={val}
              onChange={e => updateSet(ex.id, i, field, e.target.value)}
              onFocus={e => e.target.select()}
              style={{
                width: '100%', padding: '9px 4px', textAlign: 'center',
                fontSize: 26, fontWeight: 400, borderRadius: 8,
                letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"',
                border: `1px solid ${s.completed ? 'var(--green-200)' : 'var(--hair)'}`,
                boxSizing: 'border-box',
                background: s.completed ? 'var(--pos-soft)' : 'var(--white)',
                color: s.completed ? 'var(--pos)' : 'var(--ink)', fontFamily: 'var(--font)',
              }}
            />
          )

          return (
            <div key={ex.id} style={{
              background: 'var(--white)', border: `2px solid ${borderColor}`,
              borderRadius: 10, padding: '10px 11px', marginBottom: 6,
              boxShadow: timerActive ? '0 0 0 3px rgba(28,27,24,0.07)' : 'none',
              animation: `${slideDir === 'fwd' ? 'ex-slide-fwd' : 'ex-slide-back'} 0.22s ease`,
            }}>
              {/* Таймер отдыха — встроен в карточку (фидбэк п.2):
                  компактная строка + «убегающая» полоса, видны подходы/прогресс */}
              {timerActive && (
                <div style={{
                  marginBottom: 10, paddingBottom: 10,
                  borderBottom: '1px solid var(--hair)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 7 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                        {timerExpired ? 'Пора продолжать' : 'Отдых'}
                      </span>
                      <span style={{ fontSize: 24, fontWeight: 400, color: 'var(--ink)', letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>
                        {timerStr}
                      </span>
                    </span>
                    <span style={{ display: 'flex', gap: 18, flexShrink: 0 }}>
                      <button
                        onClick={() => skipTimer()}
                        style={{ background: 'none', border: 0, borderBottom: '1px solid var(--ink)', color: 'var(--ink-dim)', padding: '3px 1px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
                      >
                        Пропустить
                      </button>
                      <button
                        onClick={() => addTime(30)}
                        style={{ background: 'none', border: 0, borderBottom: '1px solid var(--ink)', color: 'var(--ink)', padding: '3px 1px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
                      >
                        +30 сек
                      </button>
                    </span>
                  </div>
                  <div
                    className={timerExpired ? undefined : 'rest-bar'}
                    style={{ height: 6, background: 'var(--hair)', borderRadius: 99, overflow: 'hidden' }}
                  >
                    <div style={{ height: '100%', width: `${restPct}%`, borderRadius: 99, background: 'var(--ink)', transition: 'width 1s linear' }} />
                  </div>
                  {timerNextEx && (
                    <div style={{ fontSize: 12, color: 'var(--ink-dim)', fontWeight: 600, marginTop: 7 }}>
                      далее: {timerNextEx}
                    </div>
                  )}
                  <span hidden>{timerLabel}</span>
                </div>
              )}

              {(() => {
                const gInfo = groupInfoFor(exercises, stepIdx)
                if (!gInfo) return null
                return (
                  <div style={{
                    display: 'inline-block', background: 'var(--green-50)',
                    border: '1px solid var(--green-200)', borderRadius: 20,
                    padding: '2px 9px', marginBottom: 6,
                    fontSize: 12, fontWeight: 700, color: 'var(--green-700)',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {gInfo.label} · {gInfo.pos} из {gInfo.size}
                  </div>
                )
              })()}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 8 }}>
                <span style={{ fontSize: 25, fontWeight: 700, color: 'var(--slate-900)', lineHeight: 1.1, letterSpacing: '-0.01em' }}>{name}</span>
                <span style={{ fontSize: 13, color: 'var(--slate-400)', flexShrink: 0 }}>{stepIdx + 1} / {exercises.length}</span>
              </div>
              <div style={{ fontSize: 15, color: 'var(--slate-400)', marginBottom: 8 }}>{plan}</div>

              <ExerciseImage urls={ex.exercise_library.image_urls ?? []} name={name} defaultHidden />

              {allDone && !st.skipped && (
                <div style={{
                  background: 'var(--green-50)', border: '1px solid var(--green-200)',
                  borderRadius: 8, padding: '6px 10px', marginBottom: 8,
                  fontSize: 13, color: 'var(--green-700)', fontWeight: 600,
                }}>
                  ✓ Выполнено — можно изменить отметки или значения ниже
                </div>
              )}
              {st.skipped && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'var(--slate-100)', border: '1px solid var(--slate-200)',
                  borderRadius: 8, padding: '6px 10px', marginBottom: 8,
                }}>
                  <span style={{ fontSize: 13, color: 'var(--slate-500)', fontWeight: 600 }}>Упражнение пропущено</span>
                  <button
                    onClick={() => unskipExercise(ex.id)}
                    style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue-600)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >
                    Вернуть
                  </button>
                </div>
              )}

              {ex.trainer_note && (
                <div style={{
                  background: 'var(--blue-50)', border: '1px solid var(--blue-200)',
                  borderRadius: 8, padding: '7px 10px', marginBottom: 8,
                  fontSize: 13, color: 'var(--blue-700)', lineHeight: 1.4,
                }}>
                  💬 {ex.trainer_note}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <span />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate-400)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lblCol2}</span>
                {m === 'weight' && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate-400)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Вес, кг</span>}
                <span />
              </div>
              {st.sets.map((s, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: cols,
                  gap: 6, alignItems: 'center', padding: '6px 0',
                  borderBottom: i < st.sets.length - 1 ? '1px solid var(--slate-100)' : 'none',
                }}>
                  <span style={{ fontSize: 11, color: 'var(--slate-400)', textAlign: 'center' }}>{i + 1}</span>
                  {m === 'time' ? (
                    <button
                      onClick={() => !s.completed && startTimer(parseInt(s.reps) || ex.reps, '', assignedId!, ex.id)}
                      style={{
                        width: '100%', padding: '7px 4px',
                        fontSize: 14, fontWeight: 600, borderRadius: 8,
                        border: `1.5px solid ${s.completed ? 'var(--green-200)' : 'var(--blue-200)'}`,
                        background: s.completed ? 'var(--green-50)' : 'var(--blue-50)',
                        color: s.completed ? 'var(--green-700)' : 'var(--blue-700)',
                        cursor: s.completed ? 'default' : 'pointer', fontFamily: 'var(--font)',
                      }}
                    >
                      {s.completed ? `${s.reps}с ✓` : `▶ ${s.reps || ex.reps}с`}
                    </button>
                  ) : numCell(s.reps, 'reps', s, i)}
                  {m === 'weight' && numCell(s.weight, 'weight', s, i)}
                  {checkBtn(s, i)}
                </div>
              ))}

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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <button onClick={() => addSet(ex.id)} style={{ fontSize: 15, fontWeight: 700, color: 'var(--indigo-500)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  + подход
                </button>
                {!st.skipped && (
                  <button onClick={() => skipExercise(ex.id)} style={{ fontSize: 15, color: 'var(--slate-400)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    Пропустить упражнение
                  </button>
                )}
              </div>
            </div>
          )
        })()}

        {/* Навигация между упражнениями — без прыжков, одно за раз */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            disabled={stepIdx === 0}
            onClick={() => setActiveExId(exercises[stepIdx - 1].id)}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 9, fontSize: 15, fontWeight: 600,
              border: '1.5px solid var(--slate-200)', background: '#fff',
              color: stepIdx === 0 ? 'var(--slate-300)' : 'var(--slate-600)',
              cursor: stepIdx === 0 ? 'default' : 'pointer', fontFamily: 'var(--font)',
            }}
          >
            ← Предыдущее
          </button>
          <button
            disabled={stepIdx >= exercises.length - 1}
            onClick={() => setActiveExId(exercises[stepIdx + 1].id)}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 9, fontSize: 15, fontWeight: 700,
              border: 'none', color: '#fff',
              background: stepIdx >= exercises.length - 1 ? 'var(--slate-200)' : 'var(--blue-600)',
              cursor: stepIdx >= exercises.length - 1 ? 'default' : 'pointer', fontFamily: 'var(--font)',
            }}
          >
            Следующее →
          </button>
        </div>

      </div>{/* /рабочая зона */}
      </div>{/* /экран */}

      {/* ── «Завершить тренировку» — за нижней кромкой экрана.
            Видна только при осознанном скролле вниз: защита от случайного
            тапа, который досрочно завершил бы тренировку. ── */}
      <div style={{ background: 'var(--white)', borderTop: '1px solid var(--border)', padding: '14px 13px 24px' }}>
        <div style={{ fontSize: 12, color: 'var(--slate-400)', textAlign: 'center', marginBottom: 8 }}>
          Закончили тренировку?
        </div>
        <button
          onClick={onFinishPress}
          disabled={saving}
          style={{
            width: '100%', background: 'var(--btn-primary)', color: 'var(--white)',
            border: 'none', borderRadius: 9, padding: 12,
            fontSize: 17, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1, fontFamily: 'var(--font)', letterSpacing: '0.01em',
          }}
        >
          {saving ? 'Сохранение...' : 'Завершить тренировку'}
        </button>
      </div>

      </div>{/* /скроллер */}

      {/* ── Confirm Dialog ─────────────────────────────────── */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.3)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div style={{ background: 'var(--white)', borderRadius: '16px 16px 0 0', padding: '18px 16px 22px', width: '100%', maxWidth: 390, margin: '0 auto' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--slate-900)', marginBottom: 4 }}>Завершить тренировку?</div>
            <div style={{ fontSize: 15, color: 'var(--slate-500)', lineHeight: 1.5, marginBottom: 12 }}>
              {(() => {
                const doneN = exercises.filter(ex => exState[ex.id]?.sets.some(s => s.completed)).length
                return doneN >= exercises.length
                  ? exercises.length === 1
                    ? 'Упражнение выполнено. Сохранить результат и завершить?'
                    : `Все ${plural(exercises.length, 'упражнение', 'упражнения', 'упражнений')} выполнены. Сохранить результат и завершить?`
                  : `Выполнено ${doneN} из ${plural(exercises.length, 'упражнения', 'упражнений', 'упражнений')}. Оставшиеся будут отмечены как пропущенные.`
              })()}
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
              style={{ width: '100%', background: 'var(--btn-primary)', color: 'var(--white)', border: 'none', borderRadius: 9, padding: 10, fontSize: 17, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', letterSpacing: '0.01em' }}
            >
              Готово
            </button>
          </div>
        </div>
      )}

    </Layout>
  )
}
