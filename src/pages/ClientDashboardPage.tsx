import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import ExerciseProgressList from '../components/ExerciseProgressList'
import type { AssignedWorkout, Workout } from '../types/database'

const DAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function fmtDate(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return `${DAYS_RU[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}.`
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pluralizeEx(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return `${n} упражнений`
  if (mod10 === 1) return `${n} упражнение`
  if (mod10 >= 2 && mod10 <= 4) return `${n} упражнения`
  return `${n} упражнений`
}

interface AssignmentData extends AssignedWorkout {
  workout: Workout
  exerciseCount: number
  completedCount: number
}

export default function ClientDashboardPage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [assignments, setAssignments] = useState<AssignmentData[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'history' | 'progress'>('active')

  useEffect(() => { if (profile) loadData() }, [profile])

  async function loadData() {
    if (!profile) return
    const { data } = await supabase
      .from('assigned_workouts')
      .select('*, workout:workouts(*)')
      .eq('client_id', profile.id)
      .order('assigned_at', { ascending: false })

    const enriched = await Promise.all((data ?? []).map(async a => {
      const [{ count }, { data: res }] = await Promise.all([
        supabase.from('exercises').select('*', { count: 'exact', head: true }).eq('workout_id', a.workout_id),
        supabase.from('exercise_results').select('completed').eq('assigned_workout_id', a.id),
      ])
      return {
        ...a,
        exerciseCount: count ?? 0,
        completedCount: (res ?? []).filter(r => r.completed).length,
      }
    }))
    setAssignments(enriched)
    setLoading(false)
  }

  const today = toDateStr(new Date())
  const pending = assignments.filter(a => a.status === 'pending')
  const history = assignments.filter(a => a.status === 'completed')

  const activeSorted = [...pending].sort((a, b) => {
    const aT = a.planned_date === today ? 0 : 1
    const bT = b.planned_date === today ? 0 : 1
    if (aT !== bT) return aT - bT
    if (!a.planned_date && !b.planned_date) return 0
    if (!a.planned_date) return 1
    if (!b.planned_date) return -1
    return a.planned_date.localeCompare(b.planned_date)
  })

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12 text-[var(--slate-400)] text-[15px]">Загрузка...</div>
      </Layout>
    )
  }

  const initials = (profile?.name ?? '?').slice(0, 2).toUpperCase()

  return (
    <Layout>
      {/* Header — аккаунт (бренд — в глобальной шапке Layout) */}
      <div className="sticky top-0 z-10 bg-white -mx-[13px] px-[16px] py-[14px] border-b border-[var(--border)]">
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-[8px]">
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-[8px]"
              title="Личный кабинет"
            >
              <div className="text-[20px] font-extrabold text-[var(--slate-700)]">{profile?.name}</div>
              <div className="w-[34px] h-[34px] rounded-full bg-[var(--blue-50)] text-[var(--blue-600)] flex items-center justify-center text-[11px] font-bold border-[1.5px] border-[var(--blue-200)]">
                {initials}
              </div>
            </button>
            <button
              onClick={() => signOut()}
              className="ml-[4px] w-[28px] h-[28px] flex items-center justify-center text-[var(--slate-400)] hover:text-[var(--slate-600)] rounded-full hover:bg-[var(--slate-100)] transition-colors"
              title="Выйти"
            >
              <LogOut className="w-[16px] h-[16px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs — Активные | История | Прогресс */}
      <div className="sticky top-[60px] z-10 flex bg-white -mx-[13px] px-[16px] border-b border-[var(--border)]">
        {([
          { key: 'active', label: 'Активные' },
          { key: 'history', label: 'История' },
          { key: 'progress', label: 'Прогресс' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-[11px] text-[15px] font-medium text-center border-b-2 -mb-[1px] transition-colors ${
              tab === key ? 'text-[var(--blue-600)] border-[var(--blue-600)]' : 'text-[var(--slate-500)] border-transparent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="pt-[8px] pb-[32px]">

        {/* ACTIVE */}
        {tab === 'active' && (
          <>
            {activeSorted.length === 0 && (
              <div className="text-center py-[40px] px-[8px] text-[14px] text-[var(--slate-400)] leading-[1.6]">
                Пока нет активных тренировок. Как только тренер назначит — они появятся здесь.
              </div>
            )}
            {activeSorted.map(a => {
              const isToday = a.planned_date === today
              const dateLabel = isToday
                ? 'Сегодня'
                : a.planned_date
                  ? fmtDate(a.planned_date)
                  : 'Без даты'
              return (
                <button
                  key={a.id}
                  onClick={() => navigate(`/client/workout/${a.id}`)}
                  className={`w-full flex items-center justify-between gap-[10px] text-left rounded-[10px] px-[14px] py-[14px] mb-[5px] border ${
                    isToday
                      ? 'bg-[var(--blue-50)] border-[var(--blue-100)]'
                      : 'bg-white border-[var(--border)]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-semibold text-[var(--slate-900)] mb-[3px] truncate">
                      {a.workout?.name}
                    </div>
                    <div className={`text-[12px] ${isToday ? 'text-[var(--blue-600)] font-semibold' : 'text-[var(--slate-400)]'}`}>
                      {dateLabel} · {pluralizeEx(a.exerciseCount)}
                    </div>
                  </div>
                  <span className="text-[var(--slate-300)] text-[20px] shrink-0">›</span>
                </button>
              )
            })}
          </>
        )}

        {/* HISTORY */}
        {tab === 'history' && (
          history.length === 0
            ? (
              <div className="text-center py-[40px] px-[8px] text-[14px] text-[var(--slate-400)] leading-[1.6]">
                История пуста
              </div>
            )
            : history.map(a => {
                const pct = a.exerciseCount > 0 ? Math.round(a.completedCount / a.exerciseCount * 100) : 0
                const dateLabel = a.completed_at
                  ? fmtDate(a.completed_at)
                  : a.planned_date ? fmtDate(a.planned_date) : '—'

                const badge = pct === 100
                  ? 'bg-[var(--green-100)] text-[var(--green-700)]'
                  : pct >= 60
                  ? 'bg-[var(--amber-100)] text-[var(--amber-800)]'
                  : pct > 0
                  ? 'bg-[var(--red-100)] text-[var(--red-800)]'
                  : 'bg-[var(--slate-100)] text-[var(--slate-500)]'

                return (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/client/session/${a.id}`)}
                    className="w-full flex items-center justify-between gap-[6px] text-left rounded-[10px] px-[12px] py-[10px] mb-[5px] bg-white border border-[var(--border)]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-medium text-[var(--slate-900)] truncate">
                        {a.workout?.name}
                      </div>
                      <div className="text-[12px] text-[var(--slate-400)] mt-[2px]">
                        {dateLabel}
                      </div>
                    </div>
                    <span className={`text-[11px] font-bold px-[8px] py-[2px] rounded-full whitespace-nowrap ${badge}`}>
                      {pct}%
                    </span>
                    <span className="text-[var(--slate-300)] text-[17px] shrink-0">›</span>
                  </button>
                )
              })
        )}

        {/* PROGRESS — placeholder */}
        {tab === 'progress' && profile && (
          <div className="pt-[8px]">
            <ExerciseProgressList clientId={profile.id} />
          </div>
        )}

      </div>
    </Layout>
  )
}
