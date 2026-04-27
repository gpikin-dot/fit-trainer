import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Invite, Profile } from '../types/database'

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [trainer, setTrainer] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkInvite() {
      if (!token) { setError('Неверная ссылка'); setLoading(false); return }

      const { data: inv } = await supabase
        .from('invites')
        .select('*')
        .eq('token', token)
        .single()

      if (!inv) { setError('Приглашение не найдено'); setLoading(false); return }
      if (inv.used_by) { setError('Приглашение уже использовано. Попросите тренера прислать новое'); setLoading(false); return }
      if (new Date(inv.expires_at) < new Date()) { setError('Приглашение истекло. Попросите тренера прислать новое'); setLoading(false); return }

      const { data: trainerData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', inv.trainer_id)
        .single()

      setInvite(inv)
      setTrainer(trainerData)
      sessionStorage.setItem('invite_token', token)
      sessionStorage.setItem('invite_trainer_name', trainerData?.name ?? '')
      setLoading(false)
    }
    checkInvite()
  }, [token])

  useEffect(() => {
    if (!loading && invite) {
      navigate('/register/client', { replace: true })
    }
  }, [loading, invite])

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-500">Проверка приглашения...</div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={() => navigate('/login')} className="text-indigo-600 hover:underline text-sm">
          На главную
        </button>
      </div>
    </div>
  )

  return null
}
