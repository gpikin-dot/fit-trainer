import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Star, Check, Calendar, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { ErrorMessage } from '../components/UI'
import type { ExerciseLibrary, Workout, Profile } from '../types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 'selectClient' | 'selectTemplate' | 'customize' | 'date'

interface ExerciseConfig {
  library_exercise_id: string
  library: ExerciseLibrary
  order: number
  sets: number
  reps: number
  weight_kg: number
  rest_sec: number | null
  trainer_note: string
  origSets: number
  origReps: number
  origWeight: number
}

type DateChoice = 'today' | 'tomorrow' | 'pick' | 'none'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase()
}

function localDate(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 14) return `${n} ${many}`
  if (m10 === 1) return `${n} ${one}`
  if (m10 >= 2 && m10 <= 4) return `${n} ${few}`
  return `${n} ${many}`
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ['selectClient', 'selectTemplate', 'customize', 'date']
  // For flows that skip selectClient or selectTemplate we still show 3 meaningful dots:
  // customize and date are always steps 2 and 3 (indices 2 and 3)
  const idx = steps.indexOf(step)
  const dots = [0, 1, 2] // represent customize-adjacent steps
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {dots.map(i => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full transition-colors ${
            i < idx
              ? 'bg-indigo-600'
              : i === idx
              ? 'bg-indigo-600'
              : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  )
}

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-10 h-10 text-base' : 'w-9 h-9 text-sm'
  return (
    <div className={`${cls} rounded-full bg-slate-100 flex items-center justify-center font-medium text-slate-600 shrink-0`}>
      {initials(name)}
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-slate-500 flex items-center gap-1 text-sm hover:text-slate-700 mb-4"
    >
      <ArrowLeft className="w-4 h-4" /> Назад
    </button>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function AssignWorkoutFlow() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile } = useAuth()

  const qWorkoutId = searchParams.get('workoutId')
  const qClientId = searchParams.get('clientId')
  const qRepeatFrom = searchParams.get('repeatFrom') // session_exercises source

  // Determine initial step
  function initStep(): Step {
    if (qRepeatFrom && qWorkoutId && qClientId) return 'date'
    if (qWorkoutId && qClientId) return 'customize'
    if (qWorkoutId) return 'selectClient'
    return 'selectTemplate'
  }

  const [step, setStep] = useState<Step>(initStep)

  // Selected IDs
  const [selectedClientId, setSelectedClientId] = useState<string | null>(qClientId)
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(qWorkoutId)

  // Data
  const [clients, setClients] = useState<Profile[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [workoutTimeCounts, setWorkoutTimeCounts] = useState<Record<string, number>>({}) // clientId+workoutId → count
  const [exercises, setExercises] = useState<ExerciseConfig[]>([])

  // Cached names for display
  const [workoutName, setWorkoutName] = useState('')
  const [clientName, setClientName] = useState('')

  // Date step
  const [dateChoice, setDateChoice] = useState<DateChoice>('today')
  const [pickedDate, setPickedDate] = useState(localDate(2))

  // UI state
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // ── Load data on mount ───────────────────────────────────────────────────

  useEffect(() => {
    if (!profile) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function loadData() {
    if (!profile) return
    setLoading(true)
    setError('')

    try {
      // Always load clients for trainer
      const { data: clientData } = await supabase
        .from('profiles')
        .select('*')
        .eq('trainer_id', profile.id)
        .order('name')
      setClients(clientData ?? [])

      // Always load workouts for trainer
      const { data: workoutData } = await supabase
        .from('workouts')
        .select('*')
        .eq('trainer_id', profile.id)
        .order('name')
      setWorkouts(workoutData ?? [])

      // Preload workout counts per client if we know the client
      if (selectedClientId && workoutData) {
        await loadWorkoutCounts(selectedClientId, workoutData.map(w => w.id))
      }

      // Preload workout name if known
      if (selectedWorkoutId) {
        const found = (workoutData ?? []).find(w => w.id === selectedWorkoutId)
        if (found) setWorkoutName(found.name)
      }

      // Preload client name if known
      if (selectedClientId) {
        const found = (clientData ?? []).find(c => c.id === selectedClientId)
        if (found) setClientName(found.name)
      }

      // Load exercises for customize step
      if ((qWorkoutId && qClientId) || qRepeatFrom) {
        await loadExercises()
      }
    } catch (e) {
      setError('Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }

  async function loadWorkoutCounts(clientId: string, workoutIds: string[]) {
    if (workoutIds.length === 0) return
    const { data } = await supabase
      .from('assigned_workouts')
      .select('workout_id')
      .eq('client_id', clientId)
      .in('workout_id', workoutIds)
      .eq('status', 'completed')

    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      const key = `${clientId}:${row.workout_id}`
      counts[key] = (counts[key] ?? 0) + 1
    }
    setWorkoutTimeCounts(counts)
  }

  async function loadExercises() {
    const sourceWorkoutId = selectedWorkoutId ?? qWorkoutId
    if (!sourceWorkoutId) return

    if (qRepeatFrom) {
      // Load from session_exercises of that assigned workout
      const { data } = await supabase
        .from('session_exercises')
        .select('*, exercise_library:exercises_library(*)')
        .eq('assigned_workout_id', qRepeatFrom)
        .order('order')

      if (data) {
        setExercises(
          data.map((se: any) => ({
            library_exercise_id: se.library_exercise_id,
            library: se.exercise_library,
            order: se.order,
            sets: se.sets,
            reps: se.reps,
            weight_kg: se.weight_kg,
            rest_sec: se.rest_sec,
            trainer_note: se.trainer_note ?? '',
            origSets: se.sets,
            origReps: se.reps,
            origWeight: se.weight_kg,
          }))
        )
      }
    } else {
      // Load from template exercises
      const { data } = await supabase
        .from('exercises')
        .select('*, exercise_library:exercises_library(*)')
        .eq('workout_id', sourceWorkoutId)
        .order('order')

      if (data) {
        setExercises(
          data.map((e: any) => ({
            library_exercise_id: e.library_exercise_id,
            library: e.exercise_library,
            order: e.order,
            sets: e.sets,
            reps: e.reps,
            weight_kg: e.weight_kg,
            rest_sec: e.rest_sec,
            trainer_note: e.trainer_note ?? '',
            origSets: e.sets,
            origReps: e.reps,
            origWeight: e.weight_kg,
          }))
        )
      }
    }
  }

  // ── Step transitions ─────────────────────────────────────────────────────

  async function handleClientSelected() {
    if (!selectedClientId) return
    const client = clients.find(c => c.id === selectedClientId)
    if (client) setClientName(client.name)
    await loadWorkoutCounts(selectedClientId, workouts.map(w => w.id))
    setStep('selectTemplate')
  }

  async function handleTemplateSelected(workoutId: string) {
    setSelectedWorkoutId(workoutId)
    const workout = workouts.find(w => w.id === workoutId)
    if (workout) setWorkoutName(workout.name)
    setLoading(true)

    // Load exercises for this template
    const { data } = await supabase
      .from('exercises')
      .select('*, exercise_library:exercises_library(*)')
      .eq('workout_id', workoutId)
      .order('order')

    setExercises(
      (data ?? []).map((e: any) => ({
        library_exercise_id: e.library_exercise_id,
        library: e.exercise_library,
        order: e.order,
        sets: e.sets,
        reps: e.reps,
        weight_kg: e.weight_kg,
        rest_sec: e.rest_sec,
        trainer_note: e.trainer_note ?? '',
        origSets: e.sets,
        origReps: e.reps,
        origWeight: e.weight_kg,
      }))
    )
    setLoading(false)
    setStep('customize')
  }

  function handleBack() {
    if (step === 'selectClient') { navigate(-1); return }
    if (step === 'selectTemplate') {
      if (qWorkoutId) { navigate(-1); return }
      setStep('selectClient')
      return
    }
    if (step === 'customize') {
      if (qRepeatFrom || (qWorkoutId && qClientId)) { navigate(-1); return }
      if (qWorkoutId) { setStep('selectClient'); return }
      setStep('selectTemplate')
      return
    }
    if (step === 'date') {
      if (qRepeatFrom) { navigate(-1); return }
      setStep('customize')
    }
  }

  function updateExercise(idx: number, patch: Partial<ExerciseConfig>) {
    setExercises(prev =>
      prev.map((ex, i) => (i === idx ? { ...ex, ...patch } : ex))
    )
  }

  function removeExercise(idx: number) {
    setExercises(prev =>
      prev.filter((_, i) => i !== idx).map((ex, i) => ({ ...ex, order: i }))
    )
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleAssign() {
    if (!selectedClientId || !selectedWorkoutId) return
    setSubmitting(true)
    setError('')

    try {
      let plannedDate: string | null = null
      if (dateChoice === 'today') plannedDate = localDate(0)
      else if (dateChoice === 'tomorrow') plannedDate = localDate(1)
      else if (dateChoice === 'pick') plannedDate = pickedDate
      else plannedDate = null

      const { data: aw, error: awErr } = await supabase
        .from('assigned_workouts')
        .insert({
          workout_id: selectedWorkoutId,
          client_id: selectedClientId,
          planned_date: plannedDate,
          status: 'pending',
        })
        .select()
        .single()

      if (awErr || !aw) throw new Error(awErr?.message ?? 'Ошибка создания записи')

      if (exercises.length > 0) {
        const { error: seErr } = await supabase.from('session_exercises').insert(
          exercises.map(ex => ({
            assigned_workout_id: aw.id,
            library_exercise_id: ex.library_exercise_id,
            order: ex.order,
            sets: ex.sets,
            reps: ex.reps,
            weight_kg: ex.weight_kg,
            rest_sec: ex.rest_sec,
            trainer_note: ex.trainer_note || null,
          }))
        )
        if (seErr) throw new Error(seErr.message)
      }

      navigate(`/trainer/client/${selectedClientId}`)
    } catch (e: any) {
      setError(e.message ?? 'Неизвестная ошибка')
      setSubmitting(false)
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────

  const modifiedCount = exercises.filter(
    ex =>
      ex.sets !== ex.origSets ||
      ex.reps !== ex.origReps ||
      ex.weight_kg !== ex.origWeight
  ).length

  const favoriteWorkouts = workouts.filter(w => w.is_favorite)
  const otherWorkouts = workouts.filter(w => !w.is_favorite)

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
          Загрузка...
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <StepDots step={step} />

        {/* ── Step: selectClient ──────────────────────────────────────────── */}
        {step === 'selectClient' && (
          <>
            <BackButton onClick={handleBack} />
            <h1 className="text-xl font-semibold mb-1">Выбрать клиента</h1>
            {workoutName && (
              <p className="text-sm text-slate-500 mb-5">{workoutName}</p>
            )}

            {clients.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                У вас пока нет клиентов
              </div>
            ) : (
              <div className="space-y-2 mb-6">
                {clients.map(client => {
                  const count = selectedWorkoutId
                    ? (workoutTimeCounts[`${client.id}:${selectedWorkoutId}`] ?? 0)
                    : 0
                  const selected = selectedClientId === client.id
                  return (
                    <button
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
                      }`}
                    >
                      <Avatar name={client.name} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{client.name}</div>
                        {count > 0 && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            {plural(count, 'раз', 'раза', 'раз')} делал эту тренировку
                          </div>
                        )}
                      </div>
                      {selected && <Check className="w-5 h-5 text-indigo-600 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}

            {error && <ErrorMessage text={error} />}

            <button
              onClick={handleClientSelected}
              disabled={!selectedClientId}
              className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl disabled:opacity-40 hover:bg-indigo-700 transition-colors"
            >
              Далее
            </button>
          </>
        )}

        {/* ── Step: selectTemplate ────────────────────────────────────────── */}
        {step === 'selectTemplate' && (
          <>
            <BackButton onClick={handleBack} />
            <h1 className="text-xl font-semibold mb-1">Назначить тренировку</h1>
            {clientName && (
              <p className="text-sm text-slate-500 mb-5">{clientName}</p>
            )}

            {favoriteWorkouts.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Избранные
                </h2>
                <div className="space-y-2 mb-4">
                  {favoriteWorkouts.map(w => {
                    const count = selectedClientId
                      ? (workoutTimeCounts[`${selectedClientId}:${w.id}`] ?? 0)
                      : 0
                    return (
                      <WorkoutRow
                        key={w.id}
                        workout={w}
                        count={count}
                        onSelect={() => handleTemplateSelected(w.id)}
                      />
                    )
                  })}
                </div>
              </>
            )}

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">Все шаблоны</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <div className="space-y-2 mb-4">
              {otherWorkouts.map(w => {
                const count = selectedClientId
                  ? (workoutTimeCounts[`${selectedClientId}:${w.id}`] ?? 0)
                  : 0
                return (
                  <WorkoutRow
                    key={w.id}
                    workout={w}
                    count={count}
                    onSelect={() => handleTemplateSelected(w.id)}
                  />
                )
              })}
              {workouts.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  У вас нет шаблонов тренировок
                </div>
              )}
            </div>

            <button
              onClick={() => navigate('/trainer/workout/new')}
              className="w-full border border-dashed border-slate-300 text-slate-500 text-sm py-3 rounded-xl hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              + Создать новый шаблон
            </button>

            {error && <ErrorMessage text={error} />}
          </>
        )}

        {/* ── Step: customize ─────────────────────────────────────────────── */}
        {step === 'customize' && (
          <>
            <BackButton onClick={handleBack} />
            <h1 className="text-xl font-semibold mb-4">Настройка упражнений</h1>

            {/* Client chip */}
            {clientName && (
              <div className="flex items-center gap-2 mb-3">
                <Avatar name={clientName} size="md" />
                <div>
                  <div className="font-medium text-sm">{clientName}</div>
                </div>
              </div>
            )}

            {/* Template label */}
            {workoutName && (
              <div className="bg-slate-100 text-slate-600 text-sm font-medium px-3 py-2 rounded-lg mb-5 inline-block">
                {workoutName}
              </div>
            )}

            {exercises.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                В шаблоне нет упражнений
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                {exercises.map((ex, idx) => {
                  const setsModified = ex.sets !== ex.origSets
                  const repsModified = ex.reps !== ex.origReps
                  const weightModified = ex.weight_kg !== ex.origWeight

                  const fieldCls = (modified: boolean) =>
                    `w-full rounded px-2 py-1 text-sm border ${
                      modified
                        ? 'bg-indigo-50 border-indigo-200'
                        : 'border-slate-300 bg-white'
                    } focus:outline-none focus:ring-2 focus:ring-indigo-400`

                  const exType = ex.library.exercise_type ?? 'strength'

                  return (
                    <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-sm">
                          {idx + 1}. {ex.library.name_ru}
                        </span>
                        <button
                          onClick={() => removeExercise(idx)}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                          aria-label="Удалить"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {exType === 'cardio_time' ? (
                          <>
                            <div>
                              <label className="text-xs text-slate-500">Интервалы</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={isNaN(ex.sets) ? '' : ex.sets}
                                onChange={e => updateExercise(idx, { sets: parseInt(e.target.value) || 0 })}
                                onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(idx, { sets: 1 }) }}
                                onFocus={e => e.target.select()}
                                className={`mt-1 ${fieldCls(setsModified)}`}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500">Длит. (мин)</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={isNaN(ex.reps) ? '' : ex.reps}
                                onChange={e => updateExercise(idx, { reps: parseInt(e.target.value) || 0 })}
                                onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(idx, { reps: 1 }) }}
                                onFocus={e => e.target.select()}
                                className={`mt-1 ${fieldCls(repsModified)}`}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500">Дистанция (км)</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={ex.weight_kg}
                                onChange={e => updateExercise(idx, { weight_kg: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                                onFocus={e => e.target.select()}
                                placeholder="0"
                                className={`mt-1 ${fieldCls(weightModified)}`}
                              />
                            </div>
                          </>
                        ) : exType === 'cardio_reps' ? (
                          <>
                            <div>
                              <label className="text-xs text-slate-500">Подходы</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={isNaN(ex.sets) ? '' : ex.sets}
                                onChange={e => updateExercise(idx, { sets: parseInt(e.target.value) || 0 })}
                                onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(idx, { sets: 1 }) }}
                                onFocus={e => e.target.select()}
                                className={`mt-1 ${fieldCls(setsModified)}`}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500">Повторения</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={isNaN(ex.reps) ? '' : ex.reps}
                                onChange={e => updateExercise(idx, { reps: parseInt(e.target.value) || 0 })}
                                onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(idx, { reps: 1 }) }}
                                onFocus={e => e.target.select()}
                                className={`mt-1 ${fieldCls(repsModified)}`}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="text-xs text-slate-500">Подходы</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={isNaN(ex.sets) ? '' : ex.sets}
                                onChange={e => updateExercise(idx, { sets: parseInt(e.target.value) || 0 })}
                                onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(idx, { sets: 1 }) }}
                                onFocus={e => e.target.select()}
                                className={`mt-1 ${fieldCls(setsModified)}`}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500">Повторения</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={isNaN(ex.reps) ? '' : ex.reps}
                                onChange={e => updateExercise(idx, { reps: parseInt(e.target.value) || 0 })}
                                onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(idx, { reps: 1 }) }}
                                onFocus={e => e.target.select()}
                                className={`mt-1 ${fieldCls(repsModified)}`}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500">Вес (кг)</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={ex.weight_kg}
                                onChange={e => updateExercise(idx, { weight_kg: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                                onFocus={e => e.target.select()}
                                className={`mt-1 ${fieldCls(weightModified)}`}
                              />
                            </div>
                          </>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="text-xs text-slate-500">Отдых (сек)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={ex.rest_sec ?? ''}
                            onChange={e =>
                              updateExercise(idx, {
                                rest_sec: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                            onFocus={e => e.target.select()}
                            placeholder="по умолч."
                            className="mt-1 w-full border border-slate-300 bg-white rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Комментарий</label>
                          <input
                            type="text"
                            value={ex.trainer_note}
                            onChange={e => updateExercise(idx, { trainer_note: e.target.value })}
                            placeholder="Необязательно"
                            className="mt-1 w-full border border-slate-300 bg-white rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {error && <ErrorMessage text={error} />}

            <button
              onClick={() => setStep('date')}
              className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Далее
            </button>
          </>
        )}

        {/* ── Step: date ──────────────────────────────────────────────────── */}
        {step === 'date' && (
          <>
            <BackButton onClick={handleBack} />
            <h1 className="text-xl font-semibold mb-5">Дата тренировки</h1>

            {/* Summary card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
              <div className="font-medium text-sm mb-1">{workoutName}</div>
              <div className="text-sm text-slate-500">{clientName}</div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-xs text-slate-400">
                  {plural(exercises.length, 'упражнение', 'упражнения', 'упражнений')}
                </span>
                {modifiedCount > 0 && (
                  <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {modifiedCount} изменено
                  </span>
                )}
              </div>
            </div>

            {/* Template notice */}
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <span>ℹ</span>
              <span>Шаблон тренировки не изменится — только эта сессия.</span>
            </div>

            {/* Date choices */}
            <div className="space-y-2 mb-6">
              {(
                [
                  { value: 'today', label: 'Сегодня', sub: localDate(0) },
                  { value: 'tomorrow', label: 'Завтра', sub: localDate(1) },
                  { value: 'pick', label: 'Выбрать дату', sub: null },
                  { value: 'none', label: 'Без даты', sub: null },
                ] as { value: DateChoice; label: string; sub: string | null }[]
              ).map(opt => {
                const active = dateChoice === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setDateChoice(opt.value)}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                      active
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'bg-white border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                        active ? 'border-indigo-600' : 'border-slate-300'
                      }`}
                    >
                      {active && <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      {opt.sub && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {new Date(opt.sub + 'T00:00:00').toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'long',
                          })}
                        </div>
                      )}
                    </div>
                    {opt.value === 'pick' && active && (
                      <input
                        type="date"
                        value={pickedDate}
                        min={localDate(0)}
                        onChange={e => setPickedDate(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className="ml-auto text-sm border border-indigo-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    )}
                    {opt.value === 'pick' && !active && (
                      <Calendar className="ml-auto w-4 h-4 text-slate-300" />
                    )}
                  </button>
                )
              })}
            </div>

            {error && <ErrorMessage text={error} />}

            <button
              onClick={handleAssign}
              disabled={submitting || (dateChoice === 'pick' && !pickedDate)}
              className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl disabled:opacity-40 hover:bg-indigo-700 transition-colors"
            >
              {submitting ? 'Назначаем...' : 'Назначить тренировку'}
            </button>
          </>
        )}
      </div>
    </Layout>
  )
}

// ─── WorkoutRow helper ────────────────────────────────────────────────────────

function WorkoutRow({
  workout,
  count,
  onSelect,
}: {
  workout: Workout
  count: number
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-4 rounded-xl border bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all text-left"
    >
      {workout.is_favorite && (
        <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{workout.name}</div>
      </div>
      {count > 0 && (
        <span className="shrink-0 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
          {count} раз
        </span>
      )}
      <ArrowLeft className="w-4 h-4 text-slate-300 rotate-180 shrink-0" />
    </button>
  )
}
