import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Copy, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { Modal } from '../components/UI'
import { canCreateWorkout, canInviteClient } from '../lib/planLimits'
import type { Workout, Profile, Invite } from '../types/database'

const DAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Доброе утро,'
  if (h >= 12 && h < 18) return 'Добрый день,'
  return 'Добрый вечер,'
}

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
  const { profile, signOut } = useAuth()
  const [tab, setTab] = useState<'today' | 'clients' | 'library'>('today')
  const [menuOpen, setMenuOpen] = useState(false)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [workoutStats, setWorkoutStats] = useState<Map<string, { exerciseCount: number; usageCount: number }>>(new Map())
  const [clients, setClients] = useState<ClientStat[]>([])
  const [todayItems, setTodayItems] = useState<TodayItem[]>([])
  const [upcomingItems, setUpcomingItems] = useState<ScheduledItem[]>([])
  const [openDateItems, setOpenDateItems] = useState<ScheduledItem[]>([])
  const [, setInvites] = useState<Invite[]>([])
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

  if (loading) return (
    <Layout>
      <div className="text-center py-12 text-[var(--slate-400)] text-[var(--text-meta)]">Загрузка...</div>
    </Layout>
  )

  return (
    <Layout>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white -mx-[13px] px-[14px]">
        <div className="pt-[11px] pb-0 flex items-start justify-between">
          <div>
            <div className="text-[var(--text-meta)] text-[var(--slate-400)]">{getGreeting()}</div>
            <div className="text-[var(--text-title)] font-bold text-[var(--slate-900)] tracking-[-0.01em]">{profile?.name}</div>
          </div>

          {/* ··· menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="w-[28px] h-[28px] flex items-center justify-center text-[var(--slate-400)] hover:text-[var(--slate-600)] rounded-full hover:bg-[var(--slate-100)] transition-colors mt-[2px]"
            >
              <span className="text-[var(--text-body)] leading-none tracking-widest">···</span>
            </button>

            {menuOpen && (
              <>
                {/* backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                {/* dropdown */}
                <div className="absolute right-0 top-[32px] z-50 bg-white border border-[var(--border)] rounded-[10px] shadow-[0_4px_16px_rgba(0,0,0,0.10)] overflow-hidden min-w-[148px]">
                  <button
                    onClick={() => { setMenuOpen(false); signOut() }}
                    className="w-full text-left px-[12px] py-[10px] text-[var(--text-nav)] font-semibold text-[var(--red-500)] hover:bg-[var(--slate-50)] flex items-center gap-[7px]"
                  >
                    <span className="text-[var(--text-nav)]">→</span> Выйти из аккаунта
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1.5px solid var(--slate-100)' }}>
          {([
            { key: 'today', label: 'Сегодня' },
            { key: 'clients', label: 'Клиенты' },
            { key: 'library', label: 'Шаблоны' },
          ] as const).map(({ key, label }) => (
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

      {/* Body */}
      <div className="px-0 pt-[11px] pb-[14px]">
        {error && (
          <div className="text-[var(--text-meta)] text-red-500 mb-2">{error}</div>
        )}

        {/* TODAY */}
        {tab === 'today' && (
          <div>
            {todayItems.length > 0 && (
              <div>
                <div className="text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.08em] mb-[5px]">
                  Тренировки сегодня
                </div>
                {todayItems.map(item => (
                  <div
                    key={item.assignId}
                    onClick={() => navigate(`/trainer/client/${item.clientId}`)}
                    className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px] cursor-pointer"
                  >
                    <div className="flex items-center gap-[8px]">
                      <div className="w-[28px] h-[28px] rounded-full bg-[var(--indigo-50)] flex items-center justify-center shrink-0 text-[var(--text-nav)] font-bold text-[var(--indigo-500)]">
                        {item.clientName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[var(--text-body)] font-semibold text-[var(--slate-900)]">{item.clientName}</div>
                        <div className="text-[var(--text-meta)] text-[var(--slate-400)] mt-[1px] truncate">{item.workoutName}</div>
                        <div className="mt-[4px]">
                          {item.started ? (
                            <span className="text-[var(--text-meta)] font-semibold bg-[var(--green-50)] text-[var(--green-600)] px-[7px] py-[2px] rounded-[20px]">
                              ● Начата
                            </span>
                          ) : (
                            <span className="text-[var(--text-meta)] font-semibold bg-[var(--slate-50)] text-[var(--slate-400)] px-[7px] py-[2px] rounded-[20px]">
                              ● Не начата
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[var(--slate-300)] text-[var(--text-meta)]">›</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {upcomingItems.length > 0 && (
              <div className="mt-[8px]">
                <div className="text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.08em] mb-[5px]">
                  Ближайшие дни
                </div>
                <div className="bg-white border border-[var(--border)] rounded-[10px] overflow-hidden">
                  {upcomingItems.map((item, idx) => {
                    const d = new Date(item.plannedDate + 'T00:00:00')
                    return (
                      <div
                        key={item.assignId}
                        onClick={() => navigate(`/trainer/client/${item.clientId}`)}
                        className={`px-[11px] py-[7px] flex items-center gap-2 cursor-pointer ${idx < upcomingItems.length - 1 ? 'border-b border-[var(--slate-50)]' : ''}`}
                      >
                        <div className="w-[26px] shrink-0 text-center">
                          <div className="text-[0.5rem] text-[var(--slate-400)] uppercase">{DAYS_SHORT[d.getDay()]}</div>
                          <div className="text-[var(--text-body)] font-bold text-[var(--slate-900)]">{d.getDate()}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[var(--text-body)] font-semibold text-[var(--slate-900)]">{item.clientName}</div>
                          <div className="text-[var(--text-meta)] text-[var(--slate-400)] mt-[1px]">{item.workoutName}</div>
                        </div>
                        <span className="text-[var(--slate-300)] text-[var(--text-meta)]">›</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {openDateItems.length > 0 && (
              <div className="mt-[8px]">
                <div className="text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.08em] mb-[5px]">
                  Открытая дата
                </div>
                <div className="bg-white border border-[var(--border)] rounded-[10px] overflow-hidden">
                  {openDateItems.map((item, idx) => (
                    <div
                      key={item.assignId}
                      onClick={() => navigate(`/trainer/client/${item.clientId}`)}
                      className={`px-[11px] py-[7px] flex items-center gap-2 cursor-pointer ${idx < openDateItems.length - 1 ? 'border-b border-[var(--slate-50)]' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[var(--text-body)] font-semibold text-[var(--slate-900)]">{item.clientName}</div>
                        <div className="text-[var(--text-meta)] text-[var(--slate-400)] mt-[1px]">{item.workoutName}</div>
                      </div>
                      <span className="text-[var(--slate-300)] text-[var(--text-meta)]">›</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {todayItems.length === 0 && upcomingItems.length === 0 && openDateItems.length === 0 && (
              <div className="text-center text-[var(--text-meta)] text-[var(--slate-400)] leading-[1.6] py-[28px]">
                Нет активных тренировок на сегодня.<br />
                Назначьте клиентам через их карточку.
              </div>
            )}
          </div>
        )}

        {/* CLIENTS */}
        {tab === 'clients' && (
          <div>
            <button
              onClick={handleCreateInvite}
              className="border-[1.5px] border-dashed border-[var(--indigo-300)] bg-[var(--indigo-50)] rounded-[10px] px-[10px] py-[10px] text-[var(--text-nav)] font-bold text-[var(--indigo-500)] w-full mb-[11px]"
            >
              + Пригласить нового клиента
            </button>

            {clients.length === 0 ? (
              <div className="text-center text-[var(--text-meta)] text-[var(--slate-400)] leading-[1.6] py-[28px]">
                Клиентов пока нет.<br />
                Пригласите первого.
              </div>
            ) : (
              clients.map(c => {
                const isMissed = c.compliance !== null && c.compliance < 60 && c.missedCount > 0
                const compBadge = c.compliance === null
                  ? { bg: 'bg-[var(--slate-100)]', text: 'text-[var(--slate-500)]', label: '—' }
                  : c.compliance >= 80
                  ? { bg: 'bg-[var(--green-100)]', text: 'text-[var(--green-700)]', label: `${c.compliance}%` }
                  : c.compliance >= 60
                  ? { bg: 'bg-[var(--amber-100)]', text: 'text-[var(--amber-800)]', label: `${c.compliance}%` }
                  : { bg: 'bg-[var(--red-100)]', text: 'text-[var(--red-800)]', label: `${c.compliance}%` }

                const subtitle = c.missedCount > 0
                  ? `Пропустил ${c.missedCount} ${c.missedCount === 1 ? 'тренировку' : 'тренировки'}`
                  : c.nextWorkoutDate
                    ? `Следующая: ${fmtDate(c.nextWorkoutDate)}`
                    : c.lastWorkoutDate
                      ? `Последняя: ${fmtDate(c.lastWorkoutDate)}`
                      : 'Нет тренировок'

                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/trainer/client/${c.id}`)}
                    className={`border rounded-[10px] px-[11px] py-[9px] mb-[5px] cursor-pointer flex items-center gap-[8px] ${
                      isMissed ? 'border-[var(--red-200)] bg-[var(--red-50)]' : 'border-[var(--border)] bg-white'
                    }`}
                  >
                    <div className={`w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 text-[var(--text-nav)] font-bold ${
                      isMissed ? 'bg-[var(--red-50)] text-[var(--red-500)]' : 'bg-[var(--indigo-50)] text-[var(--indigo-500)]'
                    }`}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-1 items-center">
                        <span className="text-[var(--text-body)] font-semibold text-[var(--slate-900)]">{c.name}</span>
                        {c.compliance !== null && (
                          <span className={`text-[var(--text-meta)] font-bold px-[7px] py-[2px] rounded-[20px] shrink-0 ${compBadge.bg} ${compBadge.text}`}>
                            {compBadge.label}
                          </span>
                        )}
                      </div>
                      <div className={`text-[var(--text-meta)] mt-[2px] ${isMissed ? 'text-[var(--red-400)]' : 'text-[var(--slate-400)]'}`}>
                        {subtitle}
                      </div>
                    </div>
                    <span className="text-[var(--slate-300)] text-[var(--text-meta)]">›</span>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* TEMPLATES */}
        {tab === 'library' && (() => {
          const favorites = workouts.filter(w => w.is_favorite)
          const rest = workouts.filter(w => !w.is_favorite)

          const WorkoutRow = (w: Workout) => {
            const stats = workoutStats.get(w.id)
            return (
              <div
                key={w.id}
                onClick={() => navigate(`/trainer/workout/${w.id}`)}
                className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px] flex items-center gap-[8px] cursor-pointer"
              >
                <span
                  onClick={e => toggleFavorite(e, w)}
                  className={`text-[var(--text-body)] shrink-0 ${w.is_favorite ? 'text-[var(--amber-500)]' : 'text-[var(--slate-200)]'}`}
                >★</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[var(--text-body)] font-semibold text-[var(--slate-900)]">{w.name}</div>
                  <div className="text-[var(--text-meta)] text-[var(--slate-400)] mt-[1px]">
                    {stats?.exerciseCount ?? 0} упр.
                    {(stats?.usageCount ?? 0) > 0 && ` · ${stats!.usageCount} раз`}
                  </div>
                </div>
                <span className="text-[var(--slate-300)] text-[var(--text-meta)]">›</span>
              </div>
            )
          }

          return (
            <div>
              {favorites.length > 0 && (
                <div>
                  <div className="text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.08em] mb-[5px]">
                    Избранные
                  </div>
                  {favorites.map(WorkoutRow)}
                </div>
              )}

              {favorites.length > 0 && rest.length > 0 && (
                <div className="flex items-center gap-[6px] my-[7px]">
                  <div className="flex-1 h-[1px] bg-[var(--border)]" />
                  <span className="text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.06em]">Все шаблоны</span>
                  <div className="flex-1 h-[1px] bg-[var(--border)]" />
                </div>
              )}

              {rest.length > 0 && (
                <div>
                  {favorites.length === 0 && (
                    <div className="text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.08em] mb-[5px]">
                      Все шаблоны
                    </div>
                  )}
                  {rest.map(WorkoutRow)}
                </div>
              )}

              {workouts.length === 0 && (
                <div className="text-center text-[var(--text-meta)] text-[var(--slate-400)] leading-[1.6] py-[28px]">
                  Нет шаблонов.<br />Создайте первый!
                </div>
              )}

              <button
                onClick={handleCreateWorkout}
                className="w-full bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] text-white text-[var(--text-nav)] font-bold rounded-[9px] py-[10px] mt-[8px] flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Новый шаблон
              </button>
            </div>
          )
        })()}
      </div>

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
      <h2 className="text-[var(--text-body)] font-bold text-[var(--slate-900)] mb-1">Приглашение создано</h2>
      <p className="text-[var(--text-meta)] text-[var(--slate-500)] leading-[1.5] mb-3">
        Отправьте эту ссылку клиенту. Действует 7 дней, использовать можно один раз.
      </p>
      <div className="bg-[var(--slate-50)] border border-[var(--slate-200)] rounded-[7px] px-[9px] py-[7px]">
        <span className="text-[var(--text-meta)] font-mono text-[var(--slate-600)] break-all">{link}</span>
      </div>
      <div className="flex gap-[6px] mt-3">
        <button
          onClick={copy}
          className="flex-1 bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] text-white text-[var(--text-nav)] font-bold rounded-[8px] py-[9px] flex items-center justify-center gap-1"
        >
          {copied ? (
            <><Check className="w-3.5 h-3.5" /> ✓ Скопировано</>
          ) : (
            <><Copy className="w-3.5 h-3.5" /> Скопировать</>
          )}
        </button>
        <button
          onClick={onClose}
          className="text-[var(--text-nav)] text-[var(--slate-500)] px-[4px] py-[9px]"
        >
          Закрыть
        </button>
      </div>
    </Modal>
  )
}
