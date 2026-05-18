import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkInvite() {
      if (!token) { setError('not_found'); setLoading(false); return }

      // Безопасная валидация: токен не раскрывает таблицу invites,
      // RPC возвращает только статус + имя тренера.
      const { data, error: rpcErr } = await supabase
        .rpc('validate_invite', { p_token: token })
      const row = Array.isArray(data) ? data[0] : data

      if (rpcErr || !row || !row.valid) {
        setError(row?.reason ?? 'not_found')
        setLoading(false)
        return
      }

      sessionStorage.setItem('invite_token', token)
      sessionStorage.setItem('invite_trainer_name', row.trainer_name ?? '')
      setReady(true)
      setLoading(false)
    }
    checkInvite()
  }, [token])

  useEffect(() => {
    if (!loading && ready) {
      navigate('/register/client', { replace: true })
    }
  }, [loading, ready])

  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
      <div className="max-w-[390px] text-center">
        <div className="text-[15px] text-[var(--slate-400)]">Проверка...</div>
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
          <div className="text-[1.875rem] mb-[14px]">⚠️</div>
          <div className="text-[15px] font-semibold text-[var(--red-600)] leading-[1.4] mb-2">{message}</div>
          <div className="text-[15px] text-[var(--slate-400)] mb-4">
            Ссылка действует 7 дней и используется один раз
          </div>
          <button
            onClick={() => navigate('/login')}
            className="text-[14px] font-semibold text-[var(--blue-600)] cursor-pointer"
          >
            ← На главную
          </button>
        </div>
      </div>
    )
  }

  return null
}
