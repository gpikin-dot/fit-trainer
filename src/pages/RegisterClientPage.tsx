import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function RegisterClientPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [trainerName, setTrainerName] = useState('')
  const [token, setToken] = useState('')

  useEffect(() => {
    const t = sessionStorage.getItem('invite_token')
    const tn = sessionStorage.getItem('invite_trainer_name')
    if (!t) { navigate('/login', { replace: true }); return }
    setToken(t)
    setTrainerName(tn ?? '')
  }, [navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Введите имя'); return }
    setError('')
    setLoading(true)

    // Re-validate invite
    const { data: invite } = await supabase
      .from('invites')
      .select('*')
      .eq('token', token)
      .single()

    if (!invite || invite.used_by || new Date(invite.expires_at) < new Date()) {
      setError('Приглашение недействительно. Попросите тренера прислать новое.')
      setLoading(false)
      return
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name: name.trim(), role: 'client', trainer_id: invite.trainer_id } },
    })

    if (authError || !data.user) {
      setError(authError?.message === 'User already registered'
        ? 'Этот email уже зарегистрирован'
        : (authError?.message ?? 'Ошибка регистрации'))
      setLoading(false)
      return
    }

    await supabase.from('invites').update({ used_by: data.user.id }).eq('token', token)

    sessionStorage.removeItem('invite_token')
    sessionStorage.removeItem('invite_trainer_name')

    navigate('/client', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#EEF1F6] flex items-center justify-center px-4">
      <div className="max-w-[390px] w-full">
        <div className="bg-white rounded-[16px] px-[17px] py-[22px] border border-[#E8EDF3]">
          <h1 className="text-[16px] font-bold text-[#0F172A] mb-[2px]">Регистрация клиента</h1>
          <p className="text-[10px] text-[#94A3B8] mb-4">Создайте аккаунт для тренировок</p>

          {trainerName && (
            <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-[9px] px-[11px] py-[9px] mb-4">
              <div className="text-[9px] font-bold text-[#16A34A] uppercase tracking-[0.04em]">Вас приглашает тренер</div>
              <div className="text-[12px] font-bold text-[#166534] mt-[1px]">{trainerName}</div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-[10px]">
              <label className="block text-[9px] font-bold text-[#64748B] uppercase tracking-[0.04em] mb-1">
                Имя
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Иван Иванов"
                required
                className="w-full border border-[#E2E8F0] rounded-[8px] px-[10px] py-[8px] text-[11px] text-[#0F172A] bg-[#F8FAFC] outline-none focus:border-indigo-400"
              />
            </div>
            <div className="mb-[10px]">
              <label className="block text-[9px] font-bold text-[#64748B] uppercase tracking-[0.04em] mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-[#E2E8F0] rounded-[8px] px-[10px] py-[8px] text-[11px] text-[#0F172A] bg-[#F8FAFC] outline-none focus:border-indigo-400"
              />
            </div>
            <div className="mb-[10px]">
              <label className="block text-[9px] font-bold text-[#64748B] uppercase tracking-[0.04em] mb-1">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-[#E2E8F0] rounded-[8px] px-[10px] py-[8px] text-[11px] text-[#0F172A] bg-[#F8FAFC] outline-none focus:border-indigo-400"
              />
            </div>

            {error && (
              <div className="text-[10px] text-red-500 mb-2">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#6366F1] hover:bg-[#4338CA] disabled:opacity-50 text-white text-[11px] font-bold rounded-[9px] py-[10px] mt-1"
            >
              {loading ? 'Создание аккаунта...' : 'Зарегистрироваться'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
