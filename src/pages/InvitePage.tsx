import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Invite } from '../types/database'

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<Invite | null>(null)
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

      if (!inv) { setError('not_found'); setLoading(false); return }
      if (inv.used_by) { setError('used'); setLoading(false); return }
      if (new Date(inv.expires_at) < new Date()) { setError('expired'); setLoading(false); return }

      const { data: trainerData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', inv.trainer_id)
        .single()

      setInvite(inv)
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
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
      <div className="max-w-[390px] text-center">
        <div className="text-[12px] text-[var(--slate-400)]">Проверка...</div>
      </div>
    </div>
  )

  if (error) {
    const message = error === 'not_found'
      ? 'Приглашение не найдено.'
      : error === 'used'
      ? 'Приглашение уже использовано.'
      : error === 'expired'
      ? 'Приглашение истекло. Попросите тренера прислать новое.'
      : error

    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
        <div className="max-w-[390px] text-center">
          <div className="text-[30px] mb-[14px]">⚠️</div>
          <div className="text-[12px] font-semibold text-[var(--red-600)] leading-[1.4] mb-2">{message}</div>
          <div className="text-[10px] text-[var(--slate-400)] mb-4">
            Ссылка действует 7 дней и используется один раз
          </div>
          <button
            onClick={() => navigate('/login')}
            className="text-[11px] font-semibold text-[var(--indigo-500)] cursor-pointer"
          >
            ← На главную
          </button>
        </div>
      </div>
    )
  }

  return null
}
