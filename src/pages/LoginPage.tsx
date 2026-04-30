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
        {/* Card */}
        <div className="bg-white rounded-[10px] px-[17px] py-[16px] border border-[var(--border-card)]">
          {/* Logo — inside card, centered */}
          <div className="flex items-center justify-center gap-[7px] mb-[12px]">
            <div className="w-[30px] h-[30px] bg-[var(--indigo-50)] rounded-[9px] flex items-center justify-center">
              🏋️
            </div>
            <span className="text-[var(--text-title)] font-extrabold tracking-[-0.02em] text-[var(--slate-900)]">FitTrainer</span>
          </div>
          <h1 className="text-[16px] font-bold text-[var(--slate-900)] leading-tight mb-[2px]">Вход</h1>
          <p className="text-[10px] text-[var(--slate-400)] mb-[10px]">Войдите в свой аккаунт</p>

          <form onSubmit={handleLogin}>
            <div className="mb-[7px]">
              <label className="block text-[9px] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-[3px]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[10px] py-[7px] text-[11px] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
              />
            </div>
            <div className="mb-[7px]">
              <label className="block text-[9px] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-[3px]">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-[var(--slate-200)] rounded-[8px] px-[10px] py-[7px] text-[11px] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
              />
            </div>

            {error && (
              <div className="text-[9px] text-red-500 mb-2">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] disabled:opacity-50 text-white text-[11px] font-bold rounded-[9px] py-[9px] mt-1"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>

          <div className="border-t border-[var(--slate-100)] mt-[10px] pt-[10px] flex flex-col gap-[4px]">
            <Link
              to="/register/trainer"
              className="text-[10px] font-semibold text-[var(--indigo-500)] block text-center"
            >
              Я тренер — зарегистрироваться
            </Link>
            <p className="text-[9px] text-[var(--slate-400)] text-center leading-[1.4]">
              Клиент? Используйте ссылку-приглашение от тренера
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
