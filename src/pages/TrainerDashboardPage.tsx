import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, UserPlus, ChevronRight, Copy, Check, ClipboardList, Users, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { Card, EmptyState, Modal, TabButton, plural, formatDate, ErrorMessage } from '../components/UI'
import { canCreateWorkout, canInviteClient } from '../lib/planLimits'
import type { Workout, Profile, Invite } from '../types/database'

export default function TrainerDashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [tab, setTab] = useState<'workouts' | 'favorites' | 'clients'>('workouts')
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [clients, setClients] = useState<Profile[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [latestInvite, setLatestInvite] = useState<Invite | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('workouts').select('*').eq('trainer_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('trainer_id', profile.id),
      supabase.from('invites').select('*').eq('trainer_id', profile.id),
    ]).then(([w, c, i]) => {
      setWorkouts(w.data ?? [])
      setClients(c.data ?? [])
      setInvites(i.data ?? [])
      setLoading(false)
    })
  }, [profile])

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
  const favorites = workouts.filter(w => w.is_favorite)

  if (loading) return (
    <Layout>
      <div className="text-center py-12 text-slate-400">Загрузка...</div>
    </Layout>
  )

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">Панель тренера</h1>
        <div className="flex gap-2">
          <button onClick={handleCreateInvite} className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg">
            <UserPlus className="w-4 h-4" /> Пригласить клиента
          </button>
          <button onClick={handleCreateWorkout} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg">
            <Plus className="w-4 h-4" /> Создать тренировку
          </button>
        </div>
      </div>

      {error && <ErrorMessage text={error} />}

      <div className="flex gap-1 mb-5 border-b border-slate-200">
        <TabButton active={tab === 'workouts'} onClick={() => setTab('workouts')}>
          <span className="flex items-center gap-1.5"><ClipboardList className="w-4 h-4" /> Тренировки ({workouts.length})</span>
        </TabButton>
        <TabButton active={tab === 'favorites'} onClick={() => setTab('favorites')}>
          <span className="flex items-center gap-1.5"><Star className="w-4 h-4" /> Избранное ({favorites.length})</span>
        </TabButton>
        <TabButton active={tab === 'clients'} onClick={() => setTab('clients')}>
          <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> Клиенты ({clients.length})</span>
        </TabButton>
      </div>

      {(tab === 'workouts' || tab === 'favorites') && (() => {
        const list = tab === 'favorites' ? favorites : workouts
        return list.length === 0
          ? <EmptyState text={tab === 'favorites' ? 'Нет избранных тренировок. Нажмите ★ на тренировке.' : 'Пока нет тренировок. Создайте первую!'} />
          : <div className="space-y-2">
            {list.map(w => (
              <Card key={w.id} onClick={() => navigate(`/trainer/workout/${w.id}`)}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{w.name}</div>
                    <div className="text-sm text-slate-500 mt-0.5">{formatDate(w.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => toggleFavorite(e, w)}
                      className={`p-1 rounded transition-colors ${w.is_favorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                    >
                      <Star className="w-5 h-5" fill={w.is_favorite ? 'currentColor' : 'none'} />
                    </button>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
      })()}

      {tab === 'clients' && (
        clients.length === 0
          ? <EmptyState text={activeInvites.length > 0 ? 'Клиенты ещё не приняли приглашение.' : 'Нет клиентов. Нажмите «Пригласить клиента» вверху.'} />
          : <div className="space-y-2">
            {clients.map(c => (
              <Card key={c.id} onClick={() => navigate(`/trainer/client/${c.id}`)}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-slate-500 mt-0.5">{plural(0, 'тренировка', 'тренировки', 'тренировок')}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
              </Card>
            ))}
          </div>
      )}

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
      <p className="text-sm text-slate-600 mb-4">
        Отправьте эту ссылку клиенту. Действует 7 дней, использовать можно один раз.
      </p>
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 break-all text-sm font-mono">
        {link}
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={copy} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 rounded-lg">
          {copied ? <><Check className="w-4 h-4" /> Скопировано</> : <><Copy className="w-4 h-4" /> Скопировать</>}
        </button>
        <button onClick={onClose} className="px-4 text-sm text-slate-600 hover:text-slate-900">Закрыть</button>
      </div>
    </Modal>
  )
}
