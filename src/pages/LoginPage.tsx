import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authError || !data.user) {
      setError('Неверный email или пароль')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    navigate(profile?.role === 'trainer' ? '/trainer' : '/client', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
      <div className="max-w-[390px] w-full">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-[30px] h-[30px] bg-[var(--indigo-50)] rounded-[9px] flex items-center justify-center text-[var(--fs-lg)]">
            🏋️
          </div>
          <span className="text-[var(--fs-lg)] font-extrabold tracking-[-0.02em] text-[var(--slate-900)]">FitTrainer</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-[16px] px-[17px] py-[22px] border border-[var(--border)]">
          <h1 className="text-[var(--fs-xl)] font-bold text-[var(--slate-900)]">Вход</h1>
          <p className="text-[var(--fs-3xs)] text-[var(--slate-400)] mb-4">Войдите в свой аккаунт</p>

          <form onSubmit={handleLogin}>
            <div className="mb-[10px]">
              <label className="block text-[var(--fs-3xs)] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[10px] py-[8px] text-[var(--fs-xs)] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
              />
            </div>
            <div className="mb-[10px]">
              <label className="block text-[var(--fs-3xs)] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-1">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[10px] py-[8px] text-[var(--fs-xs)] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
              />
            </div>

            {error && (
              <div className="text-[var(--fs-2xs)] text-red-500 mb-2">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] disabled:opacity-50 text-white text-[var(--fs-xs)] font-bold rounded-[9px] py-[10px] mt-1"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>

          <div className="border-t border-[var(--slate-100)] mt-4 pt-[13px]">
            <Link
              to="/register/trainer"
              className="text-[var(--fs-2xs)] font-semibold text-[var(--indigo-500)] block text-center mb-2"
            >
              Я тренер — зарегистрироваться
            </Link>
            <p className="text-[var(--fs-2xs)] text-[var(--slate-400)] text-center leading-relaxed">
              Клиент? Используйте ссылку-приглашение от тренера
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
