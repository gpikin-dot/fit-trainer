import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { EmptyState } from '../components/UI'
import type { AssignedWorkout, Workout } from '../types/database'

interface AssignmentData extends AssignedWorkout {
  workout: Workout
  exerciseCount: number
  completedCount: number
}

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const DAYS_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonthDays(start: Date): (Date | null)[] {
  const y = start.getFullYear(), m = start.getMonth()
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0)
  const dow = (first.getDay() + 6) % 7
  const days: (Date | null)[] = []
  for (let i = 0; i < dow; i++) days.push(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(y, m, d))
  while (days.length % 7 !== 0) days.push(null)
  return days
}

function ProgressRing({ progress, size = 34 }: { progress: number; size?: number }) {
  const r = (size - 5) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(1, Math.max(0, progress)))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 absolute inset-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#d1fae5" strokeWidth="3" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#10b981" strokeWidth="3"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
    </svg>
  )
}

export default function ClientDashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState<AssignmentData[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const startX = useRef<number | null>(null)

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
      return { ...a, exerciseCount: count ?? 0, completedCount: (res ?? []).filter(r => r.completed).length }
    }))
    setAssignments(enriched)
    setLoading(false)
  }

  const today = toDateStr(new Date())
  const calDays = getMonthDays(currentMonth)

  // Map: date string → assignment (completed by completed_at, planned by planned_date)
  const completedByDay = new Map<string, AssignmentData>()
  const plannedByDay = new Map<string, AssignmentData>()
  for (const a of assignments) {
    if (a.status === 'completed' && a.completed_at) {
      completedByDay.set(toDateStr(new Date(a.completed_at)), a)
    } else if (a.planned_date) {
      plannedByDay.set(a.planned_date, a)
    }
  }

  const active = assignments.filter(a => a.status === 'pending')
  const todayWorkout = active.find(a => a.planned_date === today)

  // Month stats
  const completedThisMonth = assignments.filter(a => {
    if (a.status !== 'completed' || !a.completed_at) return false
    const d = new Date(a.completed_at)
    return d.getFullYear() === currentMonth.getFullYear() && d.getMonth() === currentMonth.getMonth()
  }).length

  function prevMonth() { setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)) }
  function nextMonth() { setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)) }

  // Swipe to change month
  function onTouchStart(e: React.TouchEvent) { startX.current = e.touches[0].clientX }
  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    if (Math.abs(dx) > 50) { dx < 0 ? nextMonth() : prevMonth() }
    startX.current = null
  }

  if (loading) return <Layout><div className="text-center py-12 text-slate-400">Загрузка...</div></Layout>

  return (
    <Layout>
      {/* Today block */}
      {todayWorkout ? (
        <div className="bg-slate-900 rounded-2xl p-4 mb-5">
          <div className="text-xs text-emerald-400 uppercase tracking-widest mb-1">Сегодня</div>
          <div className="font-semibold text-white text-lg mb-0.5">{todayWorkout.workout?.name}</div>
          <div className="text-xs text-slate-400 mb-3">{todayWorkout.exerciseCount} упражнений</div>
          <button onClick={() => navigate(`/client/workout/${todayWorkout.id}`)}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-2.5 rounded-xl text-sm">
            ▶ Начать тренировку
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-semibold">Мои тренировки</h1>
          {profile?.name && <div className="text-sm text-slate-400">{profile.name}</div>}
        </div>
      )}

      {/* Calendar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
        {/* Month header */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-1 text-slate-400 hover:text-slate-700">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <div className="font-semibold text-sm">{MONTHS_RU[currentMonth.getMonth()]} {currentMonth.getFullYear()}</div>
            {completedThisMonth > 0 && (
              <div className="text-xs text-emerald-600 mt-0.5">{completedThisMonth} {completedThisMonth === 1 ? 'тренировка' : completedThisMonth < 5 ? 'тренировки' : 'тренировок'}</div>
            )}
          </div>
          <button onClick={nextMonth} className="p-1 text-slate-400 hover:text-slate-700">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day names */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS_RU.map(d => (
            <div key={d} className="text-center text-[10px] text-slate-400 py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid — swipeable */}
        <div className="grid grid-cols-7 gap-y-1"
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        >
          {calDays.map((day, i) => {
            if (!day) return <div key={i} />
            const dayStr = toDateStr(day)
            const isToday = dayStr === today
            const completed = completedByDay.get(dayStr)
            const planned = plannedByDay.get(dayStr)
            const progress = completed ? (completed.exerciseCount > 0 ? completed.completedCount / completed.exerciseCount : 1) : 0

            return (
              <div key={i} className="flex items-center justify-center py-0.5">
                <button
                  onClick={() => completed && navigate(`/client/workout/${completed.id}`)}
                  className="relative w-9 h-9 flex items-center justify-center"
                >
                  {/* Progress ring for completed */}
                  {completed && <ProgressRing progress={progress} size={36} />}

                  {/* Day number */}
                  <span className={`relative z-10 text-xs font-medium leading-none
                    ${isToday && !completed ? 'w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center' : ''}
                    ${isToday && completed ? 'text-emerald-700 font-bold' : ''}
                    ${!isToday && completed ? 'text-emerald-700' : ''}
                    ${!isToday && !completed ? 'text-slate-600' : ''}
                  `}>
                    {day.getDate()}
                  </span>

                  {/* Dot for planned future workout */}
                  {planned && !completed && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400" />
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <div className="w-3 h-3 rounded-full border-2 border-emerald-500" />
            выполнена
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            запланирована
          </div>
        </div>
      </div>

      {/* Active workouts list */}
      {active.length === 0 && !todayWorkout ? (
        <EmptyState text="Тренер ещё не назначил тренировок. Загляните позже!" />
      ) : active.length > 0 ? (
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">Активные</div>
          <div className="space-y-2">
            {active.map(a => (
              <button key={a.id} onClick={() => navigate(`/client/workout/${a.id}`)}
                className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-emerald-300 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{a.workout?.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {a.exerciseCount} упражнений
                      {a.planned_date
                        ? ` · ${a.planned_date === today ? 'сегодня' : new Date(a.planned_date + 'T00:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'short' })}`
                        : ' · открытая дата'}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </Layout>
  )
}
