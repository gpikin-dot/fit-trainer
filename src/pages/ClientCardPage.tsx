import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import { EmptyState, Modal } from '../components/UI'
import type { Profile, AssignedWorkout, Workout, Exercise, ExerciseLibrary, ExerciseResult } from '../types/database'

const DAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function fmtDate(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return `${DAYS_RU[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}.`
}

type EnrichedAssignment = AssignedWorkout & {
  workout: Workout
  exercises: (Exercise & { exercise_library: ExerciseLibrary })[]
  results: ExerciseResult[]
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const barColor = pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-400' : pct > 0 ? 'bg-red-400' : 'bg-slate-200'
  const textColor = pct === 100 ? 'text-green-700' : pct >= 60 ? 'text-amber-600' : pct > 0 ? 'text-red-500' : 'text-slate-400'
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium w-8 text-right ${textColor}`}>{pct > 0 ? `${pct}%` : '—'}</span>
    </div>
  )
}

function ExerciseRow({
  ex,
  result,
  showComparison,
}: {
  ex: Exercise & { exercise_library: ExerciseLibrary }
  result?: ExerciseResult
  showComparison: boolean
}) {
  const planStr = `${ex.sets}×${ex.reps}${ex.weight_kg > 0 ? ` · ${ex.weight_kg}кг` : ''}`

  if (!showComparison) {
    return (
      <div className="text-xs">
        <div className="text-slate-700 font-medium">{ex.exercise_library.name_ru}</div>
        <div className="text-slate-400 mt-0.5">{planStr}</div>
      </div>
    )
  }

  if (!result?.completed) {
    return (
      <div className="text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-slate-700 font-medium">{ex.exercise_library.name_ru}</span>
          <span className="text-slate-300 shrink-0">—</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-slate-400">
          <span>план: {planStr}</span><span>→</span><span>не выполнено</span>
        </div>
      </div>
    )
  }

  const repsChanged = result.actual_reps !== null && result.actual_reps !== ex.reps
  const weightChanged = ex.weight_kg > 0 && result.actual_weight_kg !== null && result.actual_weight_kg !== ex.weight_kg
  const repsClass = !repsChanged ? '' : result.actual_reps! > ex.reps ? 'font-bold text-green-600' : 'font-bold text-red-500'
  const weightClass = !weightChanged ? '' : result.actual_weight_kg! > ex.weight_kg ? 'font-bold text-green-600' : 'font-bold text-red-500'

  return (
    <div className="text-xs">
      <div className="flex justify-between gap-2">
        <span className="text-slate-700 font-medium">{ex.exercise_library.name_ru}</span>
        <span className="text-slate-400 shrink-0">✓</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 text-slate-400">
        <span>план: {planStr}</span>
        <span>→</span>
        <span className="text-slate-800">
          факт: {ex.sets}×<span className={repsClass}>{result.actual_reps ?? '?'}</span>
          {ex.weight_kg > 0 && <> · <span className={weightClass}>{result.actual_weight_kg ?? '?'}кг</span></>}
        </span>
      </div>
    </div>
  )
}

export default function ClientCardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [client, setClient] = useState<Profile | null>(null)
  const [assignments, setAssignments] = useState<EnrichedAssignment[]>([])
  const [tab, setTab] = useState<'active' | 'history' | 'stats'>('active')
  const [loading, setLoading] = useState(true)
  const [repeatTarget, setRepeatTarget] = useState<EnrichedAssignment | null>(null)
  const [repeatDateType, setRepeatDateType] = useState<'open' | 'specific'>('open')
  const [repeatDate, setRepeatDate] = useState('')
  const [repeating, setRepeating] = useState(false)

  useEffect(() => {
    if (!id) return
    loadData(id)
  }, [id])

  async function loadData(clientId: string) {
    const { data: clientData } = await supabase.from('profiles').select('*').eq('id', clientId).single()
    setClient(clientData)

    const { data: assignedData } = await supabase
      .from('assigned_workouts')
      .select('*, workout:workouts(*)')
      .eq('client_id', clientId)
      .order('assigned_at', { ascending: false })

    const enriched = await Promise.all((assignedData ?? []).map(async a => {
      const [{ data: exs }, { data: res }] = await Promise.all([
        supabase.from('exercises').select('*, exercise_library:exercises_library(*)').eq('workout_id', a.workout_id).order('order'),
        supabase.from('exercise_results').select('*').eq('assigned_workout_id', a.id),
      ])
      return {
        ...a,
        exercises: (exs ?? []) as (Exercise & { exercise_library: ExerciseLibrary })[],
        results: (res ?? []) as ExerciseResult[],
      }
    }))
    setAssignments(enriched)
    setLoading(false)
  }

  async function handleRepeat() {
    if (!repeatTarget || repeating) return
    setRepeating(true)
    const payload: Record<string, unknown> = {
      workout_id: repeatTarget.workout_id,
      client_id: repeatTarget.client_id,
    }
    if (repeatDateType === 'specific' && repeatDate) payload.planned_date = repeatDate
    await supabase.from('assigned_workouts').insert(payload)
    setRepeatTarget(null)
    setRepeatDateType('open')
    setRepeatDate('')
    setRepeating(false)
    if (id) loadData(id)
  }

  if (loading) return <Layout><div className="text-center py-12 text-slate-400">Загрузка...</div></Layout>
  if (!client) return <Layout><div className="text-center py-12 text-slate-400">Клиент не найден</div></Layout>

  const active = assignments.filter(a => a.status === 'pending')
  const history = assignments.filter(a => a.status === 'completed')

  const tabs = [
    { key: 'active' as const, label: `Активные (${active.length})` },
    { key: 'history' as const, label: `История (${history.length})` },
    { key: 'stats' as const, label: 'Статистика' },
  ]

  return (
    <Layout>
      <Link to="/trainer" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> К списку клиентов
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center shrink-0">
            <span className="text-lg font-semibold text-slate-400">{client.name.charAt(0).toUpperCase()}</span>
          </div>
          <h1 className="text-xl font-semibold">{client.name}</h1>
        </div>
        <button
          onClick={() => navigate(`/trainer/workout/new?client=${client.id}`)}
          className="shrink-0 flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-2 rounded-lg"
        >
          <Plus className="w-4 h-4" /> Создать
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4">
        {tabs.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'text-indigo-600 border-indigo-600' : 'text-slate-400 border-transparent'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Active tab */}
      {tab === 'active' && (
        active.length === 0
          ? <EmptyState text="Нет активных тренировок" />
          : <div className="space-y-3">
            {active.map(a => {
              const done = a.results.filter(r => r.completed).length
              const total = a.exercises.length
              const started = a.results.length > 0
              const dateLabel = a.planned_date
                ? fmtDate(a.planned_date)
                : started ? 'Открытая дата · начата' : 'Открытая дата'
              return (
                <div key={a.id} className="bg-white border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-medium">{a.workout?.name ?? '—'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{dateLabel}</div>
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${started ? 'text-amber-600' : 'text-slate-400'}`}>
                      {done} / {total}
                    </span>
                  </div>
                  <ProgressBar done={done} total={total} />
                  <div className="space-y-2 mb-3">
                    {a.exercises.map(ex => (
                      <ExerciseRow key={ex.id} ex={ex} showComparison={false} />
                    ))}
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    {!started ? (
                      <button
                        onClick={() => navigate(`/trainer/workout/${a.workout_id}/edit`)}
                        className="w-full text-sm text-indigo-600 border border-indigo-200 rounded-lg py-2 font-medium">
                        Редактировать тренировку
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3 h-3 text-slate-300 shrink-0" />
                        <span className="text-xs text-slate-400">Клиент выполняет — редактирование недоступно</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        history.length === 0
          ? <EmptyState text="История пуста" />
          : <div className="space-y-3">
            {history.map(a => {
              const done = a.results.filter(r => r.completed).length
              const total = a.exercises.length
              const pct = total > 0 ? done / total : 0
              const countColor = pct === 1 ? 'text-green-700' : pct >= 0.6 ? 'text-amber-600' : 'text-red-500'
              const dateLabel = a.completed_at
                ? fmtDate(a.completed_at)
                : a.planned_date ? fmtDate(a.planned_date) : '—'
              return (
                <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-medium">{a.workout?.name ?? '—'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{dateLabel}</div>
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${countColor}`}>{done} / {total}</span>
                  </div>
                  <ProgressBar done={done} total={total} />
                  <div className="space-y-2 mb-3">
                    {a.exercises.map(ex => {
                      const result = a.results.find(r => r.exercise_id === ex.id)
                      return <ExerciseRow key={ex.id} ex={ex} result={result} showComparison={true} />
                    })}
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={() => { setRepeatTarget(a); setRepeatDateType('open'); setRepeatDate('') }}
                      className="w-full text-sm text-slate-600 border border-slate-200 rounded-lg py-2 font-medium">
                      Повторить тренировку
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
      )}

      {/* Stats tab */}
      {tab === 'stats' && <EmptyState text="Статистика — скоро" />}

      {/* Repeat modal */}
      {repeatTarget && (
        <Modal onClose={() => setRepeatTarget(null)}>
          <h2 className="text-xl font-semibold mb-1">Повторить тренировку</h2>
          <p className="text-sm text-slate-500 mb-4">{repeatTarget.workout?.name}</p>

          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Дата тренировки</p>
          <div className="flex gap-2 mb-3">
            <button onClick={() => setRepeatDateType('open')}
              className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${repeatDateType === 'open' ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-medium' : 'border-slate-200 text-slate-500'}`}>
              Открытая дата
            </button>
            <button onClick={() => setRepeatDateType('specific')}
              className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${repeatDateType === 'specific' ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-medium' : 'border-slate-200 text-slate-500'}`}>
              Конкретная дата
            </button>
          </div>
          {repeatDateType === 'open' && (
            <p className="text-xs text-slate-400 mb-4">Клиент сможет выполнить тренировку в любой день.</p>
          )}
          {repeatDateType === 'specific' && (
            <input type="date" value={repeatDate}
              onChange={e => setRepeatDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
              className="border border-slate-300 rounded-lg px-3 py-3 text-base font-[inherit] bg-white mb-4 min-h-[48px]" />
          )}

          <button
            onClick={handleRepeat}
            disabled={repeating || (repeatDateType === 'specific' && !repeatDate)}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium text-sm disabled:opacity-40 mb-2">
            Назначить
          </button>
          <button onClick={() => setRepeatTarget(null)} className="w-full text-sm text-slate-500 py-1">Отмена</button>
        </Modal>
      )}
    </Layout>
  )
}
