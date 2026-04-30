import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Star, Calendar } from 'lucide-react'
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
  return name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
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
  const idx = steps.indexOf(step)
  return (
    <div className="flex items-center justify-center gap-[5px] py-[8px] mb-2">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={`w-[6px] h-[6px] rounded-full transition-colors ${i <= idx ? 'bg-[var(--indigo-500)]' : 'bg-[var(--slate-200)]'}`}
        />
      ))}
    </div>
  )
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <div
      className="rounded-full bg-[var(--indigo-50)] flex items-center justify-center font-bold text-[var(--indigo-500)] shrink-0"
      style={{ width: size, height: size, fontSize: size <= 24 ? 9 : size <= 28 ? 11 : 13 }}
    >
      {initials(name)}
    </div>
  )
}

function BackButton({ onClick, label = 'Назад' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="text-[var(--text-sub)] font-semibold text-[var(--indigo-500)] hover:text-indigo-800 flex items-center gap-1 mb-[9px]"
    >
      <ArrowLeft className="w-3 h-3" /> {label}
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
  const qRepeatFrom = searchParams.get('repeatFrom')

  function initStep(): Step {
    if (qRepeatFrom && qWorkoutId && qClientId) return 'date'
    if (qWorkoutId && qClientId) return 'customize'
    if (qWorkoutId) return 'selectClient'
    return 'selectTemplate'
  }

  const [step, setStep] = useState<Step>(initStep)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(qClientId)
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(qWorkoutId)
  const [clients, setClients] = useState<Profile[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [workoutTimeCounts, setWorkoutTimeCounts] = useState<Record<string, number>>({})
  const [exercises, setExercises] = useState<ExerciseConfig[]>([])
  const [workoutName, setWorkoutName] = useState('')
  const [clientName, setClientName] = useState('')
  const [dateChoice, setDateChoice] = useState<DateChoice>('today')
  const [pickedDate, setPickedDate] = useState(localDate(2))
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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
      const { data: clientData } = await supabase
        .from('profiles').select('*').eq('trainer_id', profile.id).order('name')
      setClients(clientData ?? [])

      const { data: workoutData } = await supabase
        .from('workouts').select('*').eq('trainer_id', profile.id).order('name')
      setWorkouts(workoutData ?? [])

      if (selectedClientId && workoutData) {
        await loadWorkoutCounts(selectedClientId, workoutData.map(w => w.id))
      }

      if (selectedWorkoutId) {
        const found = (workoutData ?? []).find(w => w.id === selectedWorkoutId)
        if (found) setWorkoutName(found.name)
      }

      if (selectedClientId) {
        const found = (clientData ?? []).find(c => c.id === selectedClientId)
        if (found) setClientName(found.name)
      }

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
      .from('assigned_workouts').select('workout_id')
      .eq('client_id', clientId).in('workout_id', workoutIds).eq('status', 'completed')

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
      const { data } = await supabase
        .from('session_exercises').select('*, exercise_library:exercises_library(*)')
        .eq('assigned_workout_id', qRepeatFrom).order('order')
      if (data) {
        setExercises(data.map((se: any) => ({
          library_exercise_id: se.library_exercise_id,
          library: se.exercise_library,
          order: se.order,
          sets: se.sets, reps: se.reps, weight_kg: se.weight_kg,
          rest_sec: se.rest_sec, trainer_note: se.trainer_note ?? '',
          origSets: se.sets, origReps: se.reps, origWeight: se.weight_kg,
        })))
      }
    } else {
      const { data } = await supabase
        .from('exercises').select('*, exercise_library:exercises_library(*)')
        .eq('workout_id', sourceWorkoutId).order('order')
      if (data) {
        setExercises(data.map((e: any) => ({
          library_exercise_id: e.library_exercise_id,
          library: e.exercise_library,
          order: e.order,
          sets: e.sets, reps: e.reps, weight_kg: e.weight_kg,
          rest_sec: e.rest_sec, trainer_note: e.trainer_note ?? '',
          origSets: e.sets, origReps: e.reps, origWeight: e.weight_kg,
        })))
      }
    }
  }

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

    const { data } = await supabase
      .from('exercises').select('*, exercise_library:exercises_library(*)')
      .eq('workout_id', workoutId).order('order')

    setExercises((data ?? []).map((e: any) => ({
      library_exercise_id: e.library_exercise_id,
      library: e.exercise_library,
      order: e.order,
      sets: e.sets, reps: e.reps, weight_kg: e.weight_kg,
      rest_sec: e.rest_sec, trainer_note: e.trainer_note ?? '',
      origSets: e.sets, origReps: e.reps, origWeight: e.weight_kg,
    })))
    setLoading(false)
    setStep('customize')
  }

  function handleBack() {
    if (step === 'selectClient') { navigate(-1); return }
    if (step === 'selectTemplate') {
      if (qWorkoutId) { navigate(-1); return }
      setStep('selectClient'); return
    }
    if (step === 'customize') {
      if (qRepeatFrom || (qWorkoutId && qClientId)) { navigate(-1); return }
      if (qWorkoutId) { setStep('selectClient'); return }
      setStep('selectTemplate'); return
    }
    if (step === 'date') {
      if (qRepeatFrom) { navigate(-1); return }
      setStep('customize')
    }
  }

  function updateExercise(idx: number, patch: Partial<ExerciseConfig>) {
    setExercises(prev => prev.map((ex, i) => (i === idx ? { ...ex, ...patch } : ex)))
  }

  function removeExercise(idx: number) {
    setExercises(prev => prev.filter((_, i) => i !== idx).map((ex, i) => ({ ...ex, order: i })))
  }

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
        .insert({ workout_id: selectedWorkoutId, client_id: selectedClientId, planned_date: plannedDate, status: 'pending' })
        .select().single()

      if (awErr || !aw) throw new Error(awErr?.message ?? 'Ошибка создания записи')

      if (exercises.length > 0) {
        const { error: seErr } = await supabase.from('session_exercises').insert(
          exercises.map(ex => ({
            assigned_workout_id: aw.id,
            library_exercise_id: ex.library_exercise_id,
            order: ex.order, sets: ex.sets, reps: ex.reps, weight_kg: ex.weight_kg,
            rest_sec: ex.rest_sec, trainer_note: ex.trainer_note || null,
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

  const modifiedCount = exercises.filter(
    ex => ex.sets !== ex.origSets || ex.reps !== ex.origReps || ex.weight_kg !== ex.origWeight
  ).length

  const favoriteWorkouts = workouts.filter(w => w.is_favorite)
  const otherWorkouts = workouts.filter(w => !w.is_favorite)

  // Row/input style for customize step
  const numInput = 'bg-[var(--slate-50)] border border-[var(--slate-200)] rounded-[6px] px-[4px] py-[5px] text-[var(--text-sub)] font-bold text-[var(--slate-900)] text-center w-full outline-none focus:border-indigo-400'
  const noteInput = 'bg-[var(--slate-50)] border border-[var(--slate-200)] rounded-[6px] px-[7px] py-[5px] text-[var(--text-label)] text-[var(--slate-600)] italic w-full outline-none focus:border-indigo-400 text-left'

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-[var(--slate-400)] text-[var(--text-sub)]">Загрузка...</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="pt-[11px] pb-[14px]">
        <StepDots step={step} />

        {/* ── Step: selectClient ──────────────────────────────────────────── */}
        {step === 'selectClient' && (
          <>
            <BackButton onClick={handleBack} label={workoutName || 'Назад'} />
            <h1 className="text-[var(--text-title)] font-bold text-[var(--slate-900)]">Выбрать клиента</h1>
            {workoutName && (
              <p className="text-[var(--text-label)] text-[var(--slate-400)] mb-5">{workoutName}</p>
            )}

            {clients.length === 0 ? (
              <div className="text-center py-12 text-[var(--slate-400)] text-[var(--text-sub)]">У вас пока нет клиентов</div>
            ) : (
              <div className="mb-5">
                {clients.map(client => {
                  const count = selectedWorkoutId
                    ? (workoutTimeCounts[`${client.id}:${selectedWorkoutId}`] ?? 0)
                    : 0
                  const selected = selectedClientId === client.id
                  return (
                    <button
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={`bg-white border-[1.5px] rounded-[10px] px-[10px] py-[8px] mb-[4px] flex items-center gap-[7px] cursor-pointer w-full text-left transition-colors ${
                        selected ? 'border-[var(--indigo-500)] bg-[var(--indigo-50)]' : 'border-[var(--border)]'
                      }`}
                    >
                      <Avatar name={client.name} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[var(--text-sub)] font-semibold text-[var(--slate-900)]">{client.name}</div>
                        <div className="text-[var(--text-label)] text-[var(--slate-400)] mt-[1px]">
                          {count > 0
                            ? `${plural(count, 'раз', 'раза', 'раз')} делал эту тренировку`
                            : 'не делал'
                          }
                        </div>
                      </div>
                      {selected ? (
                        <div className="w-[16px] h-[16px] rounded-full bg-[var(--indigo-500)] flex items-center justify-center text-white text-[var(--text-label)] shrink-0">✓</div>
                      ) : (
                        <span className="text-[var(--slate-300)] text-[var(--text-sub)]">›</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {error && <ErrorMessage text={error} />}

            <button
              onClick={handleClientSelected}
              disabled={!selectedClientId}
              className="w-full bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] text-white text-[var(--text-sub)] font-bold rounded-[9px] py-[10px] disabled:opacity-40"
            >
              Далее
            </button>
          </>
        )}

        {/* ── Step: selectTemplate ────────────────────────────────────────── */}
        {step === 'selectTemplate' && (
          <>
            <BackButton onClick={handleBack} label={clientName || 'Назад'} />
            <h1 className="text-[var(--text-title)] font-bold text-[var(--slate-900)]">Назначить тренировку</h1>
            {clientName && (
              <p className="text-[var(--text-label)] text-[var(--slate-400)] mb-5">{clientName}</p>
            )}

            {favoriteWorkouts.length > 0 && (
              <div>
                <div className="text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.06em] mb-[5px]">Избранные</div>
                {favoriteWorkouts.map(w => {
                  const count = selectedClientId ? (workoutTimeCounts[`${selectedClientId}:${w.id}`] ?? 0) : 0
                  return (
                    <WorkoutSelectRow key={w.id} workout={w} count={count} onSelect={() => handleTemplateSelected(w.id)} />
                  )
                })}
              </div>
            )}

            <div className="flex items-center gap-[6px] my-[7px]">
              <div className="flex-1 h-[1px] bg-[var(--border)]" />
              <span className="text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.06em]">Все шаблоны</span>
              <div className="flex-1 h-[1px] bg-[var(--border)]" />
            </div>

            <div>
              {otherWorkouts.map(w => {
                const count = selectedClientId ? (workoutTimeCounts[`${selectedClientId}:${w.id}`] ?? 0) : 0
                return (
                  <WorkoutSelectRow key={w.id} workout={w} count={count} onSelect={() => handleTemplateSelected(w.id)} />
                )
              })}
              {workouts.length === 0 && (
                <div className="text-center py-8 text-[var(--slate-400)] text-[var(--text-sub)]">У вас нет шаблонов тренировок</div>
              )}
            </div>

            <button
              onClick={() => navigate('/trainer/workout/new')}
              className="w-full border border-dashed border-[var(--indigo-200)] text-[var(--indigo-500)] text-[var(--text-sub)] font-bold py-[9px] rounded-[9px] mt-[6px]"
            >
              + Создать новый шаблон
            </button>

            {error && <ErrorMessage text={error} />}
          </>
        )}

        {/* ── Step: customize ─────────────────────────────────────────────── */}
        {step === 'customize' && (
          <>
            <BackButton onClick={handleBack} label="Выбор клиента" />
            <h1 className="text-[var(--text-title)] font-bold text-[var(--slate-900)]">Настройка упражнений</h1>

            {clientName && (
              <div className="flex items-center gap-[6px] bg-[var(--slate-50)] border border-[var(--slate-200)] rounded-[8px] px-[8px] py-[5px] mb-[7px] mt-[6px]">
                <Avatar name={clientName} size={22} />
                <span className="text-[var(--text-sub)] font-semibold text-[var(--slate-900)]">{clientName}</span>
              </div>
            )}

            {workoutName && (
              <div className="bg-[var(--slate-100)] text-[var(--slate-500)] text-[var(--text-label)] font-semibold rounded-[6px] px-[9px] py-[4px] inline-block mb-[8px]">
                {workoutName}
              </div>
            )}

            {exercises.length === 0 ? (
              <div className="text-center py-8 text-[var(--slate-400)] text-[var(--text-sub)]">В шаблоне нет упражнений</div>
            ) : (
              <div className="mb-5">
                {exercises.map((ex, idx) => {
                  const setsModified = ex.sets !== ex.origSets
                  const repsModified = ex.reps !== ex.origReps
                  const weightModified = ex.weight_kg !== ex.origWeight
                  const exType = ex.library.exercise_type ?? 'strength'

                  const modNumInput = (modified: boolean) =>
                    `${numInput} ${modified ? 'bg-[var(--indigo-50)] border-[var(--indigo-200)]' : ''}`

                  return (
                    <div key={idx} className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px]">
                      <div className="flex justify-between mb-[8px]">
                        <span className="text-[var(--text-sub)] font-bold text-[var(--slate-900)]">{idx + 1}. {ex.library.name_ru}</span>
                        <button
                          onClick={() => removeExercise(idx)}
                          className="text-[var(--slate-300)] hover:text-[var(--red-500)] text-[var(--text-body)] bg-transparent border-none p-0 leading-none"
                        >
                          ✕
                        </button>
                      </div>

                      {exType === 'cardio_time' ? (
                        <>
                          <div className="grid grid-cols-3 gap-[4px] mb-[4px]">
                            <div>
                              <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Интервалы</label>
                              <input type="text" inputMode="numeric" value={isNaN(ex.sets) ? '' : ex.sets}
                                onChange={e => updateExercise(idx, { sets: parseInt(e.target.value) || 0 })}
                                onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(idx, { sets: 1 }) }}
                                onFocus={e => e.target.select()} className={modNumInput(setsModified)} />
                            </div>
                            <div>
                              <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Длит. (мин)</label>
                              <input type="text" inputMode="numeric" value={isNaN(ex.reps) ? '' : ex.reps}
                                onChange={e => updateExercise(idx, { reps: parseInt(e.target.value) || 0 })}
                                onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(idx, { reps: 1 }) }}
                                onFocus={e => e.target.select()} className={modNumInput(repsModified)} />
                            </div>
                            <div>
                              <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Дистанция (км)</label>
                              <input type="text" inputMode="decimal" value={ex.weight_kg}
                                onChange={e => updateExercise(idx, { weight_kg: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                                onFocus={e => e.target.select()} placeholder="0" className={modNumInput(weightModified)} />
                            </div>
                          </div>
                        </>
                      ) : exType === 'cardio_reps' ? (
                        <div className="grid grid-cols-3 gap-[4px] mb-[4px]">
                          <div>
                            <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Подходы</label>
                            <input type="text" inputMode="numeric" value={isNaN(ex.sets) ? '' : ex.sets}
                              onChange={e => updateExercise(idx, { sets: parseInt(e.target.value) || 0 })}
                              onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(idx, { sets: 1 }) }}
                              onFocus={e => e.target.select()} className={modNumInput(setsModified)} />
                          </div>
                          <div>
                            <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Повторения</label>
                            <input type="text" inputMode="numeric" value={isNaN(ex.reps) ? '' : ex.reps}
                              onChange={e => updateExercise(idx, { reps: parseInt(e.target.value) || 0 })}
                              onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(idx, { reps: 1 }) }}
                              onFocus={e => e.target.select()} className={modNumInput(repsModified)} />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-[4px] mb-[4px]">
                          <div>
                            <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Подходы</label>
                            <input type="text" inputMode="numeric" value={isNaN(ex.sets) ? '' : ex.sets}
                              onChange={e => updateExercise(idx, { sets: parseInt(e.target.value) || 0 })}
                              onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(idx, { sets: 1 }) }}
                              onFocus={e => e.target.select()} className={modNumInput(setsModified)} />
                          </div>
                          <div>
                            <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Повторы</label>
                            <input type="text" inputMode="numeric" value={isNaN(ex.reps) ? '' : ex.reps}
                              onChange={e => updateExercise(idx, { reps: parseInt(e.target.value) || 0 })}
                              onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(idx, { reps: 1 }) }}
                              onFocus={e => e.target.select()} className={modNumInput(repsModified)} />
                          </div>
                          <div>
                            <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Вес, кг</label>
                            <input type="text" inputMode="decimal" value={ex.weight_kg}
                              onChange={e => updateExercise(idx, { weight_kg: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                              onFocus={e => e.target.select()} className={modNumInput(weightModified)} />
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '4px' }}>
                        <div>
                          <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Отдых</label>
                          <input type="text" inputMode="numeric" value={ex.rest_sec ?? ''}
                            onChange={e => updateExercise(idx, { rest_sec: e.target.value ? parseInt(e.target.value) : null })}
                            onFocus={e => e.target.select()} placeholder="—" className={numInput} />
                        </div>
                        <div>
                          <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Комментарий</label>
                          <input type="text" value={ex.trainer_note}
                            onChange={e => updateExercise(idx, { trainer_note: e.target.value })}
                            placeholder="Необязательно" className={noteInput} />
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
              className="w-full bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] text-white text-[var(--text-sub)] font-bold rounded-[9px] py-[10px]"
            >
              Далее
            </button>
          </>
        )}

        {/* ── Step: date ──────────────────────────────────────────────────── */}
        {step === 'date' && (
          <>
            <BackButton onClick={handleBack} label="Настройка" />
            <h1 className="text-[var(--text-heading)] font-bold text-[var(--slate-900)]">Дата тренировки</h1>

            {/* Summary */}
            <div className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[8px] mt-[10px]">
              <div className="text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.06em] mb-[4px]">ИТОГ</div>
              <div className="text-[var(--text-sub)] font-bold text-[var(--slate-900)]">
                {workoutName} → {clientName}
              </div>
              <div className="flex gap-[5px] flex-wrap mt-[5px]">
                <span className="text-[var(--text-label)] text-[var(--slate-500)]">
                  {plural(exercises.length, 'упражнение', 'упражнения', 'упражнений')}
                </span>
                {modifiedCount > 0 && (
                  <span className="text-[var(--text-label)] font-semibold bg-[var(--indigo-50)] text-[var(--indigo-700)] rounded-[20px] px-[7px] py-[2px] border border-[var(--indigo-200)]">
                    {modifiedCount} изменено
                  </span>
                )}
              </div>
            </div>

            {/* Notice */}
            <div className="bg-[var(--slate-50)] border border-[var(--border)] rounded-[8px] px-[9px] py-[6px] mb-[8px]">
              <span className="text-[var(--text-label)] text-[var(--slate-500)] flex gap-[5px]">
                <span>ℹ</span>
                <span>Шаблон не изменится — только эта сессия.</span>
              </span>
            </div>

            {/* Date options */}
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
                  className={`w-full flex items-center gap-[8px] cursor-pointer text-left border-[1.5px] rounded-[9px] px-[10px] py-[8px] mb-[4px] transition-colors ${
                    active ? 'border-[var(--indigo-500)] bg-[var(--indigo-50)]' : 'border-[var(--border)] bg-white'
                  }`}
                >
                  <div className={`w-[14px] h-[14px] rounded-full border-2 shrink-0 flex items-center justify-center ${
                    active ? 'border-[var(--indigo-500)]' : 'border-[var(--slate-300)]'
                  }`}>
                    {active && <div className="w-[7px] h-[7px] bg-[var(--indigo-500)] rounded-full" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-[var(--text-sub)] font-semibold text-[var(--slate-900)]">{opt.label}</div>
                    {opt.sub && (
                      <div className="text-[var(--text-label)] text-[var(--slate-500)] mt-[1px]">
                        {new Date(opt.sub + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
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
                      className="text-[var(--text-sub)] border border-[var(--indigo-200)] rounded-[6px] px-2 py-1 bg-white outline-none"
                    />
                  )}
                  {opt.value === 'pick' && !active && (
                    <Calendar className="w-4 h-4 text-[var(--slate-300)]" />
                  )}
                </button>
              )
            })}

            {error && <ErrorMessage text={error} />}

            <button
              onClick={handleAssign}
              disabled={submitting || (dateChoice === 'pick' && !pickedDate)}
              className="w-full bg-[var(--indigo-500)] text-white rounded-[10px] py-[11px] text-[var(--text-sub)] font-bold mt-[8px] disabled:opacity-40 hover:bg-[var(--indigo-700)]"
            >
              {submitting ? 'Назначаем...' : 'Назначить тренировку'}
            </button>
          </>
        )}
      </div>
    </Layout>
  )
}

// ─── WorkoutSelectRow helper ──────────────────────────────────────────────────

function WorkoutSelectRow({
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
      className="bg-white border-[1.5px] border-[var(--border)] rounded-[10px] px-[10px] py-[8px] mb-[4px] flex items-center gap-[7px] cursor-pointer w-full text-left"
    >
      {workout.is_favorite && (
        <Star className="w-3.5 h-3.5 text-[var(--amber-500)] fill-[var(--amber-500)] shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[var(--text-sub)] font-semibold text-[var(--slate-900)] truncate">{workout.name}</div>
      </div>
      {count > 0 && (
        <span className="text-[var(--text-label)] bg-[var(--slate-100)] text-[var(--slate-500)] rounded-[20px] px-[7px] py-[2px] shrink-0">
          {count} раз
        </span>
      )}
      <span className="text-[var(--slate-300)] text-[var(--text-sub)]">›</span>
    </button>
  )
}
