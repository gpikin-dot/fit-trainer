import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, UserPlus, ChevronRight, Copy, Check, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { EmptyState, Modal, ErrorMessage, formatDate } from '../components/UI'
import { canCreateWorkout, canInviteClient } from '../lib/planLimits'
import type { Workout, Profile, Invite } from '../types/database'

const DAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function fmtDate(iso: string) {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return `${DAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}.`
}

interface TodayItem {
  assignId: string
  clientId: string
  clientName: string
  workoutName: string
  exerciseCount: number
  completedCount: number
  started: boolean
}

interface ScheduledItem {
  assignId: string
  clientId: string
  clientName: string
  workoutName: string
  plannedDate: string
}

interface ClientStat extends Profile {
  compliance: number | null
  nextWorkoutDate: string | null
  lastWorkoutDate: string | null
  missedCount: number
}

export default function TrainerDashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [tab, setTab] = useState<'today' | 'clients' | 'library'>('today')
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [workoutStats, setWorkoutStats] = useState<Map<string, { exerciseCount: number; usageCount: number }>>(new Map())
  const [clients, setClients] = useState<ClientStat[]>([])
  const [todayItems, setTodayItems] = useState<TodayItem[]>([])
  const [upcomingItems, setUpcomingItems] = useState<ScheduledItem[]>([])
  const [openDateItems, setOpenDateItems] = useState<ScheduledItem[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [latestInvite, setLatestInvite] = useState<Invite | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  useEffect(() => {
    if (!profile) return
    loadData()
  }, [profile])

  async function loadData() {
    if (!profile) return

    const [{ data: workoutsData }, { data: clientsData }, { data: invitesData }] = await Promise.all([
      supabase.from('workouts').select('*').eq('trainer_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('trainer_id', profile.id),
      supabase.from('invites').select('*').eq('trainer_id', profile.id),
    ])

    const wList = workoutsData ?? []
    setWorkouts(wList)
    setInvites(invitesData ?? [])

    // Load exercise counts and usage counts per workout
    if (wList.length > 0) {
      const wIds = wList.map(w => w.id)
      const [{ data: exCounts }, { data: usageCounts }] = await Promise.all([
        supabase.from('exercises').select('workout_id').in('workout_id', wIds),
        supabase.from('assigned_workouts').select('workout_id').in('workout_id', wIds),
      ])
      const stats = new Map<string, { exerciseCount: number; usageCount: number }>()
      for (const w of wList) stats.set(w.id, { exerciseCount: 0, usageCount: 0 })
      for (const e of exCounts ?? []) {
        const s = stats.get(e.workout_id)
        if (s) s.exerciseCount++
      }
      for (const a of usageCounts ?? []) {
        const s = stats.get(a.workout_id)
        if (s) s.usageCount++
      }
      setWorkoutStats(stats)
    }

    const clientList = clientsData ?? []
    if (clientList.length === 0) {
      setClients([])
      setLoading(false)
      return
    }

    const clientIds = clientList.map(c => c.id)
    const { data: assignments } = await supabase
      .from('assigned_workouts')
      .select('*, workout:workouts(name)')
      .in('client_id', clientIds)

    const all = assignments ?? []

    const todayRaw = all.filter(a => a.planned_date === today && a.status === 'pending')
    const upcomingRaw = all
      .filter(a => a.planned_date && a.planned_date > today && a.planned_date <= nextWeek && a.status === 'pending')
      .sort((a, b) => a.planned_date.localeCompare(b.planned_date))
    const openRaw = all.filter(a => !a.planned_date && a.status === 'pending')

    const todayData = await Promise.all(todayRaw.map(async a => {
      const client = clientList.find(c => c.id === a.client_id)!
      const [{ count }, { data: results }] = await Promise.all([
        supabase.from('exercises').select('*', { count: 'exact', head: true }).eq('workout_id', a.workout_id),
        supabase.from('exercise_results').select('completed').eq('assigned_workout_id', a.id),
      ])
      return {
        assignId: a.id,
        clientId: client.id,
        clientName: client.name,
        workoutName: (a.workout as { name: string } | null)?.name ?? '—',
        exerciseCount: count ?? 0,
        completedCount: (results ?? []).filter(r => r.completed).length,
        started: (results ?? []).length > 0,
      } as TodayItem
    }))

    const toScheduled = (a: typeof all[0]): ScheduledItem => {
      const client = clientList.find(c => c.id === a.client_id)!
      return {
        assignId: a.id,
        clientId: client.id,
        clientName: client.name,
        workoutName: (a.workout as { name: string } | null)?.name ?? '—',
        plannedDate: a.planned_date ?? '',
      }
    }

    setTodayItems(todayData)
    setUpcomingItems(upcomingRaw.map(toScheduled))
    setOpenDateItems(openRaw.map(toScheduled))

    const statsClients: ClientStat[] = clientList.map(c => {
      const mine = all.filter(a => a.client_id === c.id)
      const completed = mine.filter(a => a.status === 'completed')
      const compliance = mine.length > 0 ? Math.round(completed.length / mine.length * 100) : null
      const lastWorkoutDate = completed
        .filter(a => a.completed_at)
        .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))[0]?.completed_at ?? null
      const nextWorkoutDate = mine
        .filter(a => a.status === 'pending' && a.planned_date && a.planned_date >= today)
        .sort((a, b) => a.planned_date!.localeCompare(b.planned_date!))[0]?.planned_date ?? null
      const missedCount = mine.filter(a => a.status === 'pending' && a.planned_date && a.planned_date < today).length
      return { ...c, compliance, lastWorkoutDate, nextWorkoutDate, missedCount }
    })

    setClients(statsClients)
    setLoading(false)
  }

  async function toggleFavorite(e: React.MouseEvent, workout: Workout) {
    e.stopPropagation()
    const newVal = !workout.is_favorite
    setWorkouts(prev => prev.map(w => w.id === workout.id ? { ...w, is_favorite: newVal } : w))
    await supabase.from('workouts').update({ is_favorite: newVal }).eq('id', workout.id)
  }

  async function handleCreateInvite() {
    if (!profile) return
    setError('')
    const check = await canInviteClient(profile.id)
    if (!check.allowed) { setError(check.reason ?? 'Нельзя создать приглашение'); return }
    const token = Math.random().toString(36).slice(2, 11) + Math.random().toString(36).slice(2, 11)
    const { data, error: err } = await supabase.from('invites').insert({
      token,
      trainer_id: profile.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }).select().single()
    if (err || !data) { setError('Ошибка создания приглашения'); return }
    setInvites(prev => [...prev, data])
    setLatestInvite(data)
    setShowInviteModal(true)
  }

  async function handleCreateWorkout() {
    if (!profile) return
    setError('')
    const check = await canCreateWorkout(profile.id)
    if (!check.allowed) { setError(check.reason ?? 'Нельзя создать тренировку'); return }
    navigate('/trainer/workout/new')
  }

  const activeInvites = invites.filter(i => !i.used_by && new Date(i.expires_at) > new Date())

  if (loading) return <Layout><div className="text-center py-12 text-slate-400">Загрузка...</div></Layout>

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2">
        <div>
          <div className="text-xs text-slate-400 mb-0.5">Добрый день,</div>
          <h1 className="text-xl font-semibold">{profile?.name ?? 'Тренер'}</h1>
        </div>
        <button onClick={handleCreateInvite}
          className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-medium px-3 py-2 rounded-lg">
          <UserPlus className="w-3.5 h-3.5" /> Пригласить
        </button>
      </div>

      {error && <ErrorMessage text={error} />}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4">
        {([
          { key: 'today', label: 'Сегодня' },
          { key: 'clients', label: 'Клиенты' },
          { key: 'library', label: 'Шаблоны' },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'text-indigo-600 border-indigo-600' : 'text-slate-400 border-transparent'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* TODAY */}
      {tab === 'today' && (
        <div className="space-y-5">
          {todayItems.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">Тренировки сегодня</div>
              <div className="space-y-2">
                {todayItems.map(item => (
                  <div key={item.assignId} onClick={() => navigate(`/trainer/client/${item.clientId}`)}
                    className="bg-white border border-slate-200 rounded-xl p-4 cursor-pointer">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <span className="text-sm font-semibold text-slate-500">{item.clientName.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <div className="font-medium text-sm">{item.clientName}</div>
                          <div className={`text-xs mt-0.5 ${item.started ? 'text-emerald-600' : 'text-amber-500'}`}>
                            {item.workoutName} · {item.started
                              ? `${item.completedCount} / ${item.exerciseCount} упр.`
                              : 'ещё не начал'}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </div>
                    {item.started && (
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full"
                          style={{ width: `${item.exerciseCount > 0 ? Math.round(item.completedCount / item.exerciseCount * 100) : 0}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {upcomingItems.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">Ближайшие дни</div>
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {upcomingItems.map(item => {
                  const d = new Date(item.plannedDate + 'T00:00:00')
                  return (
                    <div key={item.assignId} onClick={() => navigate(`/trainer/client/${item.clientId}`)}
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <div className="text-center w-8 shrink-0">
                          <div className="text-[10px] text-slate-400">{DAYS_SHORT[d.getDay()]}</div>
                          <div className="text-sm font-semibold text-slate-700">{d.getDate()}</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{item.clientName}</div>
                          <div className="text-xs text-slate-400">{item.workoutName}</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {openDateItems.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">Открытая дата</div>
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {openDateItems.map(item => (
                  <div key={item.assignId} onClick={() => navigate(`/trainer/client/${item.clientId}`)}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{item.clientName}</div>
                      <div className="text-xs text-slate-400">{item.workoutName}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {todayItems.length === 0 && upcomingItems.length === 0 && openDateItems.length === 0 && (
            <EmptyState text="Нет активных тренировок. Назначьте клиентам через их карточку." />
          )}
        </div>
      )}

      {/* CLIENTS */}
      {tab === 'clients' && (
        clients.length === 0
          ? <EmptyState text={activeInvites.length > 0 ? 'Клиенты ещё не приняли приглашение.' : 'Нет клиентов. Нажмите «Пригласить».'} />
          : <div className="space-y-2">
            {clients.map(c => {
              const compClass = c.compliance === null
                ? 'bg-slate-100 text-slate-400'
                : c.compliance >= 80 ? 'bg-green-100 text-green-700'
                : c.compliance >= 50 ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-600'

              const subtitle = c.missedCount > 0
                ? <span className="text-red-400">Пропустил {c.missedCount} {c.missedCount === 1 ? 'тренировку' : 'тренировки'}</span>
                : c.nextWorkoutDate
                  ? `Следующая: ${fmtDate(c.nextWorkoutDate)}`
                  : c.lastWorkoutDate
                    ? `Последняя: ${fmtDate(c.lastWorkoutDate)}`
                    : 'Нет тренировок'

              return (
                <div key={c.id} onClick={() => navigate(`/trainer/client/${c.id}`)}
                  className={`bg-white border rounded-xl p-4 cursor-pointer ${c.missedCount > 0 ? 'border-red-100' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-slate-500">{c.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{c.name}</span>
                        {c.compliance !== null && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${compClass}`}>
                            {c.compliance}%
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </div>
                </div>
              )
            })}
          </div>
      )}

      {/* ШАБЛОНЫ */}
      {tab === 'library' && (() => {
        const favorites = workouts.filter(w => w.is_favorite)
        const rest = workouts.filter(w => !w.is_favorite)
        const WorkoutRow = (w: Workout) => {
          const stats = workoutStats.get(w.id)
          return (
            <div key={w.id} onClick={() => navigate(`/trainer/workout/${w.id}`)}
              className="bg-white border border-slate-200 rounded-xl p-4 cursor-pointer flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm">{w.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {stats?.exerciseCount ?? 0} упр.
                  {(stats?.usageCount ?? 0) > 0 && ` · использована ${stats!.usageCount} ${stats!.usageCount === 1 ? 'раз' : 'раза'}`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={e => toggleFavorite(e, w)}
                  className={`p-1 rounded transition-colors ${w.is_favorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-200 hover:text-amber-300'}`}>
                  <Star className="w-4 h-4" fill={w.is_favorite ? 'currentColor' : 'none'} />
                </button>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
            </div>
          )
        }
        return (
          <div>
            {favorites.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">Избранные</div>
                <div className="space-y-2">{favorites.map(WorkoutRow)}</div>
              </div>
            )}
            {rest.length > 0 && (
              <div className="mb-3">
                {favorites.length > 0 && <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">Все шаблоны</div>}
                <div className="space-y-2">{rest.map(WorkoutRow)}</div>
              </div>
            )}
            {workouts.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">Нет шаблонов. Создайте первый!</div>}
            <button onClick={handleCreateWorkout}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-3 rounded-xl mt-1">
              <Plus className="w-4 h-4" /> Новый шаблон
            </button>
          </div>
        )
      })()}

      {showInviteModal && latestInvite && (
        <InviteModal invite={latestInvite} onClose={() => setShowInviteModal(false)} />
      )}
    </Layout>
  )
}

function InviteModal({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/invite/${invite.token}`

  function copy() {
    navigator.clipboard?.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-xl font-semibold mb-2">Приглашение создано</h2>
      <p className="text-sm text-slate-600 mb-4">Отправьте эту ссылку клиенту. Действует 7 дней, использовать можно один раз.</p>
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 break-all text-sm font-mono">{link}</div>
      <div className="flex gap-2 mt-4">
        <button onClick={copy}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 rounded-lg">
          {copied ? <><Check className="w-4 h-4" /> Скопировано</> : <><Copy className="w-4 h-4" /> Скопировать</>}
        </button>
        <button onClick={onClose} className="px-4 text-sm text-slate-600 hover:text-slate-900">Закрыть</button>
      </div>
    </Modal>
  )
}
