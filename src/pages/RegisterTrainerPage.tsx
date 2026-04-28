import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
      <div className="max-w-[390px] w-full">
        <Link
          to="/login"
          className="text-[10px] font-semibold text-[var(--indigo-500)] flex items-center gap-1 mb-3"
        >
          ← Назад
        </Link>

        <div className="bg-white rounded-[16px] px-[17px] py-[22px] border border-[var(--border)]">
          <h1 className="text-[16px] font-bold text-[var(--slate-900)] mb-[2px]">Регистрация тренера</h1>
          <p className="text-[10px] text-[var(--slate-400)] mb-4">Создайте аккаунт, чтобы приглашать клиентов</p>

          <form onSubmit={handleSubmit}>
            <div className="mb-[10px]">
              <label className="block text-[9px] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-1">
                Имя
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Иван Иванов"
                required
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[10px] py-[8px] text-[11px] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
              />
            </div>
            <div className="mb-[10px]">
              <label className="block text-[9px] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[10px] py-[8px] text-[11px] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
              />
            </div>
            <div className="mb-[10px]">
              <label className="block text-[9px] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-1">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[10px] py-[8px] text-[11px] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
              />
            </div>

            {error && (
              <div className="text-[10px] text-red-500 mb-2">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] disabled:opacity-50 text-white text-[11px] font-bold rounded-[9px] py-[10px] mt-1"
            >
              {loading ? 'Создание аккаунта...' : 'Зарегистрироваться'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
