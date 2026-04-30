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
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
      <div className="max-w-[390px] w-full">
        <div className="bg-white rounded-[16px] px-[17px] py-[22px] border border-[var(--border)]">
          <h1 className="text-[26px] font-bold text-[var(--slate-900)] mb-[2px]">Регистрация клиента</h1>

          {trainerName && (
            <div className="bg-[var(--green-50)] border border-[var(--green-200)] rounded-[9px] px-[11px] py-[9px] mb-4">
              <div className="text-[15px] font-bold text-[var(--green-600)] uppercase tracking-[0.04em]">Вас приглашает тренер</div>
              <div className="text-[15px] font-bold text-[var(--green-800)] mt-[1px]">{trainerName}</div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-[10px]">
              <label className="block text-[15px] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-1">
                Имя
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Иван Иванов"
                required
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[10px] py-[8px] text-[17px] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
              />
            </div>
            <div className="mb-[10px]">
              <label className="block text-[15px] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[10px] py-[8px] text-[17px] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
              />
            </div>
            <div className="mb-[10px]">
              <label className="block text-[15px] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-1">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[10px] py-[8px] text-[17px] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
              />
            </div>

            {error && (
              <div className="text-[15px] text-red-500 mb-2">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] disabled:opacity-50 text-white text-[16px] font-bold rounded-[9px] py-[10px] mt-1"
            >
              {loading ? 'Создание аккаунта...' : 'Зарегистрироваться'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
