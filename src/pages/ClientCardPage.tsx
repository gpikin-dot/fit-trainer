import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import { EmptyState } from '../components/UI'
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

function ProgressBar({ done, total, green = false }: { done: number; total: number; green?: boolean }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const barColor = green
    ? (pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200')
    : (pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-400' : pct > 0 ? 'bg-red-400' : 'bg-slate-200')
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function ClientCardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [client, setClient] = useState<Profile | null>(null)
  const [assignments, setAssignments] = useState<EnrichedAssignment[]>([])
  const [tab, setTab] = useState<'active' | 'history' | 'progress'>('active')
  const [loading, setLoading] = useState(true)

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

  if (loading) return <Layout><div className="text-center py-12 text-slate-400">Загрузка...</div></Layout>
  if (!client) return <Layout><div className="text-center py-12 text-slate-400">Клиент не найден</div></Layout>

  const active = assignments.filter(a => a.status === 'pending')
  const history = assignments.filter(a => a.status === 'completed')
  const total = assignments.length
  const compliance = total > 0 ? Math.round(history.length / total * 100) : null

  const today = new Date().toISOString().split('T')[0]

  const tabs = [
    { key: 'active' as const, label: `Активные (${active.length})` },
    { key: 'history' as const, label: `История (${history.length})` },
    { key: 'progress' as const, label: 'Прогресс' },
  ]

  return (
    <Layout>
      <Link to="/trainer" className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Клиенты
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center shrink-0">
            <span className="text-lg font-semibold text-slate-400">{client.name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold">{client.name}</h1>
            {total > 0 && (
              <div className="text-xs text-slate-400 mt-0.5">
                {total} {total === 1 ? 'тренировка' : total < 5 ? 'тренировки' : 'тренировок'}
                {compliance !== null && ` · посещаемость ${compliance}%`}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate(`/trainer/assign?clientId=${client.id}`)}
          className="shrink-0 flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-2 rounded-lg"
        >
          <Plus className="w-4 h-4" /> Назначить
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
          : <div className="space-y-2">
            {active.map(a => {
              const done = a.results.filter(r => r.completed).length
              const total = a.exercises.length
              const started = a.results.length > 0
              const isToday = a.planned_date === today
              const dateLabel = a.planned_date
                ? (isToday ? 'Сегодня' : fmtDate(a.planned_date))
                : started ? 'Без даты · в процессе' : 'Без даты'

              return (
                <div key={a.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{a.workout?.name ?? '—'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{dateLabel}</div>
                      <ProgressBar done={done} total={total} />
                    </div>
                    <span className={`text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full ${
                      started ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {done}/{total}
                    </span>
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
          : <div className="space-y-2">
            {history.map(a => {
              const done = a.results.filter(r => r.completed).length
              const total = a.exercises.length
              const pct = total > 0 ? done / total : 0
              const dateLabel = a.completed_at
                ? fmtDate(a.completed_at)
                : a.planned_date ? fmtDate(a.planned_date) : '—'

              return (
                <div key={a.id}
                  onClick={() => navigate(`/trainer/session/${a.id}`)}
                  className="bg-white border border-slate-200 rounded-xl px-4 py-3 cursor-pointer hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{a.workout?.name ?? '—'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{dateLabel}</div>
                      <ProgressBar done={done} total={total} green />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        pct === 1 ? 'bg-green-100 text-green-700' :
                        pct >= 0.6 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-600'
                      }`}>
                        {done}/{total}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
      )}

      {/* Progress tab */}
      {tab === 'progress' && <EmptyState text="Прогресс — скоро" />}
    </Layout>
  )
}
