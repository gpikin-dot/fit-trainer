import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { logError, isNetworkError } from '../lib/logError'

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
      if (authError && isNetworkError(authError)) {
        setError('Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.')
      } else if (authError && !/invalid login credentials/i.test(authError.message)) {
        logError('auth.login', authError)
        setError('Не удалось войти. Попробуйте ещё раз чуть позже.')
      } else {
        setError('Неверный email или пароль')
      }
      setLoading(false)
      return
    }

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profErr) {
      // Профиль не прочитался — отправляем на «/», там покажется recovery-экран
      logError('auth.login-profile', profErr, { userId: data.user.id })
      navigate('/', { replace: true })
      return
    }

    navigate(profile?.role === 'trainer' ? '/trainer' : '/client', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-[16px]">
      <div className="max-w-[390px] w-full">
        {/* Logo wordmark */}
        <div className="text-center mb-[20px]">
          <div className="text-[24px] font-extrabold text-[var(--blue-600)]">FitTrainer</div>
          <div className="text-[13px] text-[var(--slate-400)] mt-[4px]">Тренировки тренера и клиента в одном приложении</div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-[10px] px-[20px] py-[22px] border border-[var(--border)]">
          <h1 className="text-[20px] font-bold text-[var(--slate-900)] mb-[2px]">Вход</h1>
          <p className="text-[13px] text-[var(--slate-400)] mb-[16px]">Войдите в свой аккаунт</p>

          <form onSubmit={handleLogin}>
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
                autoComplete="current-password"
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
              {loading ? 'Вход...' : 'Войти'}
            </button>

            <Link
              to="/forgot-password"
              className="text-[13px] font-semibold text-[var(--slate-400)] hover:text-[var(--blue-600)] block text-center mt-[10px]"
            >
              Забыли пароль?
            </Link>
          </form>

          <div className="border-t border-[var(--slate-100)] mt-[16px] pt-[14px] flex flex-col gap-[6px]">
            <Link
              to="/register/trainer"
              className="text-[14px] font-semibold text-[var(--blue-600)] block text-center"
            >
              Я тренер — зарегистрироваться
            </Link>
            <p className="text-[12px] text-[var(--slate-400)] text-center leading-[1.4]">
              Клиент? Используйте ссылку-приглашение от тренера
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
