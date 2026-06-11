import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function RegisterTrainerPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Введите имя'); return }
    setError('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name: name.trim(), role: 'trainer' } },
    })

    if (authError || !data.user) {
      setError(authError?.message === 'User already registered'
        ? 'Этот email уже зарегистрирован'
        : (authError?.message ?? 'Ошибка регистрации'))
      setLoading(false)
      return
    }

    navigate('/trainer', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-[16px] py-[24px]">
      <div className="max-w-[390px] w-full">
        <button
          onClick={() => navigate(-1)}
          className="text-[14px] font-semibold text-[var(--blue-600)] flex items-center gap-1 mb-[12px]"
        >
          ← Назад
        </button>

        <div className="bg-white rounded-[10px] px-[20px] py-[22px] border border-[var(--border)]">
          <h1 className="text-[20px] font-bold text-[var(--slate-900)] mb-[2px]">Регистрация тренера</h1>
          <p className="text-[13px] text-[var(--slate-400)] mb-[16px]">Создайте аккаунт, чтобы приглашать клиентов</p>

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
