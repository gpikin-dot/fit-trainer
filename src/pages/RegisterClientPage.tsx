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

    // Re-validate invite (безопасно, через RPC)
    const { data: vData } = await supabase.rpc('validate_invite', { p_token: token })
    const vRow = Array.isArray(vData) ? vData[0] : vData
    if (!vRow || !vRow.valid) {
      setError('Приглашение недействительно. Попросите тренера прислать новое.')
      setLoading(false)
      return
    }

    // trainer_id НЕ передаём в метаданные — привязка только через accept_invite
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name: name.trim(), role: 'client' } },
    })

    if (authError || !data.user) {
      setError(authError?.message === 'User already registered'
        ? 'Этот email уже зарегистрирован'
        : (authError?.message ?? 'Ошибка регистрации'))
      setLoading(false)
      return
    }

    // Атомарно: привязка к тренеру + пометка инвайта использованным.
    // Ошибку НЕ глотаем — иначе аккаунт без тренера / инвайт цел.
    const { error: acceptErr } = await supabase.rpc('accept_invite', { p_token: token })
    if (acceptErr) {
      await supabase.auth.signOut()
      setError('Не удалось активировать приглашение. Попросите тренера прислать новую ссылку.')
      setLoading(false)
      return
    }

    sessionStorage.removeItem('invite_token')
    sessionStorage.removeItem('invite_trainer_name')

    navigate('/client', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-[16px] py-[24px]">
      <div className="max-w-[390px] w-full">
        <div className="bg-white rounded-[10px] px-[20px] py-[22px] border border-[var(--border)]">
          <h1 className="text-[20px] font-bold text-[var(--slate-900)] mb-[2px]">Регистрация клиента</h1>
          <p className="text-[13px] text-[var(--slate-400)] mb-[14px]">Создайте аккаунт по приглашению тренера</p>

          {trainerName && (
            <div className="bg-[var(--green-50)] border border-[var(--green-200)] rounded-[8px] px-[12px] py-[10px] mb-[14px]">
              <div className="text-[11px] font-semibold text-[var(--green-700)] uppercase tracking-[0.05em]">
                Вас приглашает тренер
              </div>
              <div className="text-[15px] font-bold text-[var(--green-800)] mt-[2px]">{trainerName}</div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-[12px]">
              <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
                Имя
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Иван Иванов"
                required
                autoComplete="name"
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[12px] py-[10px] text-[15px] text-[var(--slate-900)] bg-white outline-none focus:border-[var(--blue-500)] focus:ring-2 focus:ring-[var(--blue-100)]"
              />
            </div>
            <div className="mb-[12px]">
              <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[12px] py-[10px] text-[15px] text-[var(--slate-900)] bg-white outline-none focus:border-[var(--blue-500)] focus:ring-2 focus:ring-[var(--blue-100)]"
              />
            </div>
            <div className="mb-[14px]">
              <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={6}
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[12px] py-[10px] text-[15px] text-[var(--slate-900)] bg-white outline-none focus:border-[var(--blue-500)] focus:ring-2 focus:ring-[var(--blue-100)]"
              />
            </div>

            {error && (
              <div className="text-[13px] text-[var(--red-500)] mb-[10px]">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 text-white text-[15px] font-semibold rounded-[10px] py-[13px]"
            >
              {loading ? 'Создание аккаунта...' : 'Зарегистрироваться'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
