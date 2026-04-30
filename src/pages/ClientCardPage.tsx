import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
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

  if (loading) return (
    <Layout>
      <div className="text-center py-12 text-[var(--slate-400)] text-[var(--text-meta)]">Загрузка...</div>
    </Layout>
  )
  if (!client) return (
    <Layout>
      <div className="text-center py-12 text-[var(--slate-400)] text-[var(--text-meta)]">Клиент не найден</div>
    </Layout>
  )

  const active = assignments.filter(a => a.status === 'pending')
  const history = assignments.filter(a => a.status === 'completed')
  const total = assignments.length
  const compliance = total > 0 ? Math.round(history.length / total * 100) : null

  const today = new Date().toISOString().split('T')[0]

  const tabs = [
    { key: 'active' as const, label: 'Активные' },
    { key: 'history' as const, label: 'История' },
    { key: 'progress' as const, label: 'Прогресс' },
  ]

  return (
    <Layout>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white -mx-[13px] px-[13px]">
        <div className="pt-[11px] pb-[10px]">
          <Link
            to="/trainer"
            className="text-[var(--text-nav)] font-semibold text-[var(--indigo-500)] hover:text-indigo-800 flex items-center gap-1 mb-[9px]"
          >
            <ArrowLeft className="w-3 h-3" /> Клиенты
          </Link>

          <div className="flex items-center gap-[8px] mb-[10px]">
            <div className="w-[32px] h-[32px] rounded-full bg-[var(--indigo-50)] border-[1.5px] border-[var(--indigo-200)] flex items-center justify-center shrink-0 text-[var(--text-body)] font-bold text-[var(--indigo-500)]">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-[var(--text-body)] font-bold text-[var(--slate-900)] truncate">{client.name}</div>
              <div className="text-[0.5rem] text-[var(--slate-400)] mt-[1px]">
                {total} тренировок{compliance !== null ? ` · посещаемость ${compliance}%` : ''}
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate(`/trainer/assign?clientId=${client.id}`)}
            className="w-full border-[1.5px] border-dashed border-[var(--indigo-300)] bg-[var(--indigo-50)] rounded-[9px] py-[9px] text-[var(--text-nav)] font-bold text-[var(--indigo-500)] flex items-center justify-center gap-1 mb-[10px]"
          >
            <Plus className="w-3.5 h-3.5" /> Назначить тренировку
          </button>

          {/* Tabs */}
          <div className="flex" style={{ borderBottom: '1.5px solid var(--slate-100)' }}>
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-[8px] text-[var(--text-nav)] font-semibold text-center border-b-2 -mb-[1.5px] transition-colors ${
                  tab === key ? 'text-[var(--indigo-500)] border-[var(--indigo-500)]' : 'text-[var(--slate-400)] border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-0 pt-[11px] pb-[14px]">
        {/* Active tab */}
        {tab === 'active' && (
          active.length === 0
            ? <div className="text-center text-[var(--text-meta)] text-[var(--slate-400)] leading-[1.6] py-[28px]">Нет активных тренировок</div>
            : active.map(a => {
                const done = a.results.filter(r => r.completed).length
                const totalEx = a.exercises.length
                const started = a.results.length > 0
                const isToday = a.planned_date === today
                const dateLabel = a.planned_date
                  ? (isToday ? 'Сегодня' : fmtDate(a.planned_date))
                  : started ? 'Без даты · в процессе' : 'Без даты'
                const pct = totalEx > 0 ? Math.round((done / totalEx) * 100) : 0

                return (
                  <div key={a.id} className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px]">
                    <div className="flex justify-between gap-[6px]">
                      <div className="flex-1 min-w-0">
                        <div className="text-[var(--text-body)] font-semibold text-[var(--slate-900)]">{a.workout?.name ?? '—'}</div>
                        <div className="text-[var(--text-meta)] text-[var(--slate-400)] mt-[2px]">{dateLabel}</div>
                      </div>
                      <span className={`text-[var(--text-meta)] font-bold px-[7px] py-[2px] rounded-[20px] shrink-0 ${
                        started ? 'bg-[var(--amber-100)] text-[var(--amber-800)]' : 'bg-[var(--slate-100)] text-[var(--slate-500)]'
                      }`}>
                        {done}/{totalEx}
                      </span>
                    </div>
                    <div className="mt-[7px] h-[3px] bg-[var(--slate-100)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct > 0 ? 'bg-[var(--amber-300)]' : 'bg-[var(--slate-300)]'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })
        )}

        {/* History tab */}
        {tab === 'history' && (
          history.length === 0
            ? <div className="text-center text-[var(--text-meta)] text-[var(--slate-400)] leading-[1.6] py-[28px]">История пуста</div>
            : history.map(a => {
                const done = a.results.filter(r => r.completed).length
                const totalEx = a.exercises.length
                const pct = totalEx > 0 ? done / totalEx : 0
                const dateLabel = a.completed_at
                  ? fmtDate(a.completed_at)
                  : a.planned_date ? fmtDate(a.planned_date) : '—'

                return (
                  <div
                    key={a.id}
                    onClick={() => navigate(`/trainer/session/${a.id}`)}
                    className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px] flex items-center gap-[6px] cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[var(--text-body)] font-semibold text-[var(--slate-900)]">{a.workout?.name ?? '—'}</div>
                      <div className="text-[var(--text-meta)] text-[var(--slate-400)] mt-[2px]">{dateLabel}</div>
                    </div>
                    <div className="flex gap-[5px] shrink-0 items-center">
                      <span className={`text-[var(--text-meta)] font-bold px-[7px] py-[2px] rounded-[20px] ${
                        pct === 1 ? 'bg-[var(--green-100)] text-[var(--green-700)]'
                        : pct >= 0.6 ? 'bg-[var(--amber-100)] text-[var(--amber-800)]'
                        : 'bg-[var(--red-100)] text-[var(--red-800)]'
                      }`}>
                        {done}/{totalEx}
                      </span>
                      <span className="text-[var(--slate-300)] text-[var(--text-meta)]">›</span>
                    </div>
                  </div>
                )
              })
        )}

        {/* Progress tab */}
        {tab === 'progress' && (
          <div className="text-center text-[var(--text-meta)] text-[var(--slate-400)] leading-[1.6] py-[28px]">
            Прогресс — скоро
          </div>
        )}
      </div>
    </Layout>
  )
}
