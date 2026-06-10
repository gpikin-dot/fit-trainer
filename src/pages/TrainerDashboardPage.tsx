import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Check, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { Modal } from '../components/UI'
import { canCreateWorkout, canInviteClient } from '../lib/planLimits'
import type { Workout, Profile, Invite } from '../types/database'

interface ClientStat extends Profile {
  compliance: number | null
  hasWorkoutToday: boolean
  pendingCount: number
  nextWorkoutDate: string | null
  lastWorkoutDate: string | null
  missedCount: number
}

export default function TrainerDashboardPage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [tab, setTab] = useState<'clients' | 'templates'>('clients')

  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [workoutStats, setWorkoutStats] = useState<Map<string, { exerciseCount: number; usageCount: number }>>(new Map())
  const [clients, setClients] = useState<ClientStat[]>([])
  const [, setInvites] = useState<Invite[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [latestInvite, setLatestInvite] = useState<Invite | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

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
      .select('*')
      .in('client_id', clientIds)

    const all = assignments ?? []

    const statsClients: ClientStat[] = clientList.map(c => {
      const mine = all.filter(a => a.client_id === c.id)
      const completed = mine.filter(a => a.status === 'completed')
      const pending = mine.filter(a => a.status === 'pending')
      const compliance = mine.length > 0 ? Math.round(completed.length / mine.length * 100) : null
      const lastWorkoutDate = completed
        .filter(a => a.completed_at)
        .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))[0]?.completed_at ?? null
      const nextWorkoutDate = pending
        .filter(a => a.planned_date && a.planned_date >= today)
        .sort((a, b) => a.planned_date!.localeCompare(b.planned_date!))[0]?.planned_date ?? null
      const missedCount = pending.filter(a => a.planned_date && a.planned_date < today).length
      const hasWorkoutToday = pending.some(a => a.planned_date === today)
      return {
        ...c,
        compliance,
        hasWorkoutToday,
        pendingCount: pending.length,
        nextWorkoutDate,
        lastWorkoutDate,
        missedCount,
      }
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
      <div className="text-center py-12 text-[var(--slate-400)] text-[15px]">Загрузка...</div>
    </Layout>
  )

  const initials = (profile?.name ?? '?').slice(0, 2).toUpperCase()
  const todayClients = clients.filter(c => c.hasWorkoutToday)
  const otherClients = clients.filter(c => !c.hasWorkoutToday)

  // First-run checklist: статус шагов выводится из данных, ничего не храним.
  // compliance !== null означает, что у клиента есть хотя бы одно назначение.
  const hasTemplate = workouts.length > 0
  const hasClient = clients.length > 0
  const hasAssignment = clients.some(c => c.pendingCount > 0 || c.compliance !== null)
  const showChecklist = !(hasTemplate && hasClient && hasAssignment)

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

      {/* Tabs — Клиенты | Шаблоны */}
      <div className="sticky top-[60px] z-10 flex bg-white -mx-[13px] px-[16px] border-b border-[var(--border)]">
        {([
          { key: 'clients', label: 'Клиенты' },
          { key: 'templates', label: 'Шаблоны' },
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
        {error && (
          <div className="text-[14px] text-[var(--red-500)] mb-2 px-[3px]">{error}</div>
        )}

        {showChecklist && (
          <div className="bg-[var(--blue-50)] border border-[var(--blue-100)] rounded-[10px] px-[14px] py-[12px] mb-[10px] mt-[4px]">
            <div className="text-[13px] font-bold text-[var(--slate-900)] mb-[8px]">
              Быстрый старт — {[hasTemplate, hasClient, hasAssignment].filter(Boolean).length} из 3
            </div>
            <ChecklistStep
              idx={1}
              done={hasTemplate}
              label="Создайте шаблон тренировки"
              onClick={handleCreateWorkout}
            />
            <ChecklistStep
              idx={2}
              done={hasClient}
              label="Пригласите клиента"
              onClick={handleCreateInvite}
            />
            <ChecklistStep
              idx={3}
              done={hasAssignment}
              label="Назначьте тренировку"
              disabled={!hasTemplate || !hasClient}
              hint={!hasTemplate || !hasClient ? 'Сначала шаги 1 и 2' : undefined}
              onClick={() => navigate('/trainer/assign')}
            />
          </div>
        )}

        {/* CLIENTS TAB */}
        {tab === 'clients' && (
          <div>
            {todayClients.length > 0 && (
              <>
                <SectionLabel>Сегодня</SectionLabel>
                {todayClients.map(c => (
                  <ClientCard key={c.id} client={c} highlight today onClick={() => navigate(`/trainer/client/${c.id}`)} />
                ))}
                <Separator />
              </>
            )}
            {otherClients.map(c => (
              <ClientCard key={c.id} client={c} onClick={() => navigate(`/trainer/client/${c.id}`)} />
            ))}
            {clients.length === 0 && (
              <div className="text-center text-[14px] text-[var(--slate-400)] leading-[1.6] py-[40px]">
                Клиентов пока нет.<br />Пригласите первого.
              </div>
            )}
            <button
              onClick={handleCreateInvite}
              className="w-full mt-[20px] border-[1.5px] border-dashed border-[var(--blue-400)] bg-white text-[var(--blue-600)] rounded-[10px] py-[12px] text-[15px] font-semibold hover:bg-[var(--blue-50)] transition-colors"
            >
              + Пригласить клиента
            </button>
          </div>
        )}

        {/* TEMPLATES TAB */}
        {tab === 'templates' && (() => {
          const favorites = workouts.filter(w => w.is_favorite)
          const rest = workouts.filter(w => !w.is_favorite)
          return (
            <div>
              {favorites.length > 0 && (
                <>
                  <SectionLabel>Избранное</SectionLabel>
                  {favorites.map(w => (
                    <TemplateRow
                      key={w.id}
                      workout={w}
                      stats={workoutStats.get(w.id)}
                      onClick={() => navigate(`/trainer/workout/${w.id}`)}
                      onToggleStar={e => toggleFavorite(e, w)}
                    />
                  ))}
                  {rest.length > 0 && <Separator />}
                </>
              )}
              {rest.length > 0 && favorites.length > 0 && (
                <SectionLabel>Все шаблоны</SectionLabel>
              )}
              {rest.map(w => (
                <TemplateRow
                  key={w.id}
                  workout={w}
                  stats={workoutStats.get(w.id)}
                  onClick={() => navigate(`/trainer/workout/${w.id}`)}
                  onToggleStar={e => toggleFavorite(e, w)}
                />
              ))}
              {workouts.length === 0 && (
                <div className="text-center text-[14px] text-[var(--slate-400)] leading-[1.6] py-[40px]">
                  Шаблонов пока нет.<br />Создайте первый!
                </div>
              )}
              <button
                onClick={handleCreateWorkout}
                className="w-full mt-[20px] border-[1.5px] border-dashed border-[var(--blue-400)] bg-white text-[var(--blue-600)] rounded-[10px] py-[12px] text-[15px] font-semibold hover:bg-[var(--blue-50)] transition-colors"
              >
                + Новый шаблон
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

function ChecklistStep({
  idx, done, label, hint, disabled = false, onClick,
}: {
  idx: number; done: boolean; label: string; hint?: string; disabled?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={done || disabled}
      className="w-full flex items-center gap-[10px] py-[7px] text-left disabled:cursor-default"
    >
      <span className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold ${
        done
          ? 'bg-[var(--green-100)] text-[var(--green-600)]'
          : disabled
            ? 'bg-[var(--slate-100)] text-[var(--slate-400)]'
            : 'bg-[var(--blue-600)] text-white'
      }`}>
        {done ? '✓' : idx}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`text-[14px] font-medium block ${
          done ? 'text-[var(--slate-400)] line-through' : disabled ? 'text-[var(--slate-400)]' : 'text-[var(--slate-900)]'
        }`}>
          {label}
        </span>
        {hint && !done && (
          <span className="text-[12px] text-[var(--slate-400)] block">{hint}</span>
        )}
      </span>
      {!done && !disabled && <span className="text-[var(--slate-300)] text-[15px] shrink-0">›</span>}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold text-[var(--slate-400)] uppercase tracking-[0.08em] mt-[10px] mb-[5px] first:mt-0">
      {children}
    </div>
  )
}

function Separator() {
  return <div className="h-[1px] bg-[var(--border)] my-[10px]" />
}

function ClientCard({
  client, highlight = false, today = false, onClick,
}: {
  client: ClientStat; highlight?: boolean; today?: boolean; onClick: () => void
}) {
  const initials = client.name.slice(0, 2).toUpperCase()
  const isMissed = client.compliance !== null && client.compliance < 60 && client.missedCount > 0

  const statusLabel = today
    ? 'Сегодня'
    : client.pendingCount > 0
      ? `Назначено: ${client.pendingCount}`
      : 'Не назначено'

  const statusColor = today
    ? 'text-[var(--blue-600)]'
    : client.pendingCount > 0
      ? 'text-[var(--slate-500)]'
      : 'text-[var(--slate-400)]'

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-[10px] px-[12px] py-[10px] rounded-[10px] mb-[5px] cursor-pointer border ${
        highlight
          ? 'bg-[var(--blue-50)] border-[var(--blue-100)]'
          : isMissed
            ? 'bg-[var(--red-50)] border-[var(--red-200)]'
            : 'bg-white border-[var(--border)]'
      }`}
    >
      <div className={`w-[40px] h-[40px] rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold ${
        highlight
          ? 'bg-[var(--blue-500)] text-white'
          : isMissed
            ? 'bg-[var(--red-100)] text-[var(--red-600)]'
            : 'bg-[var(--blue-50)] text-[var(--blue-600)]'
      }`}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-[var(--slate-900)] truncate">{client.name}</div>
        {client.compliance !== null ? (
          <div className={`text-[12px] mt-[2px] font-medium ${
            client.compliance >= 80 ? 'text-[var(--green-600)]'
              : client.compliance >= 60 ? 'text-[#D97706]'
              : 'text-[var(--red-600)]'
          }`}>
            Посещ. {client.compliance}%
          </div>
        ) : (
          <div className="text-[12px] mt-[2px] text-[var(--slate-400)]">Новый клиент</div>
        )}
      </div>
      <span className={`text-[13px] font-medium shrink-0 ${statusColor}`}>{statusLabel}</span>
      <span className="text-[var(--slate-300)] text-[17px] shrink-0">›</span>
    </div>
  )
}

function TemplateRow({
  workout, stats, onClick, onToggleStar,
}: {
  workout: Workout
  stats?: { exerciseCount: number; usageCount: number }
  onClick: () => void
  onToggleStar: (e: React.MouseEvent) => void
}) {
  return (
    <div className="flex items-center gap-[6px] px-[12px] py-[10px] rounded-[10px] mb-[5px] bg-white border border-[var(--border)]">
      <button
        onClick={onToggleStar}
        className={`text-[17px] shrink-0 px-[2px] ${workout.is_favorite ? 'text-[#F59E0B]' : 'text-[var(--slate-300)]'}`}
        title={workout.is_favorite ? 'Убрать из избранного' : 'В избранное'}
      >
        {workout.is_favorite ? '★' : '☆'}
      </button>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
        <div className="text-[15px] font-medium text-[var(--slate-900)] truncate">{workout.name}</div>
        <div className="text-[12px] text-[var(--slate-400)] mt-[2px]">
          {stats?.exerciseCount ?? 0} упр{(stats?.usageCount ?? 0) > 0 && ` · ${stats!.usageCount} назначений`}
        </div>
      </div>
      <span onClick={onClick} className="text-[var(--slate-300)] text-[17px] shrink-0 cursor-pointer">›</span>
    </div>
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
      <h2 className="text-[17px] font-bold text-[var(--slate-900)] mb-[6px]">Пригласить клиента</h2>
      <p className="text-[13px] text-[var(--slate-500)] leading-[1.5] mb-[14px]">
        Отправьте эту ссылку клиенту. Она действует 7&nbsp;дней и&nbsp;её можно использовать один&nbsp;раз.
      </p>
      <div className="bg-[var(--slate-100)] rounded-[8px] px-[12px] py-[10px] mb-[12px]">
        <span className="text-[13px] font-mono text-[var(--slate-600)] break-all">{link}</span>
      </div>
      <button
        onClick={copy}
        className="w-full bg-[var(--blue-600)] hover:bg-[var(--blue-700)] text-white text-[15px] font-semibold rounded-[10px] py-[12px] flex items-center justify-center gap-[6px] mb-[8px]"
      >
        {copied ? (
          <><Check className="w-4 h-4" /> Скопировано</>
        ) : (
          <><Copy className="w-4 h-4" /> Скопировать ссылку</>
        )}
      </button>
      <button
        onClick={onClose}
        className="w-full bg-white border border-[var(--slate-200)] text-[var(--slate-700)] text-[15px] font-semibold rounded-[10px] py-[12px]"
      >
        Закрыть
      </button>
    </Modal>
  )
}
