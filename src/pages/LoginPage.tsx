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
    <div className="min-h-screen bg-[#EEF1F6] flex items-center justify-center px-4">
      <div className="max-w-[390px] w-full">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-[30px] h-[30px] bg-[#EEF2FF] rounded-[9px] flex items-center justify-center text-[15px]">
            🏋️
          </div>
          <span className="text-[15px] font-extrabold tracking-[-0.02em] text-[#0F172A]">FitTrainer</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-[16px] px-[17px] py-[22px] border border-[#E8EDF3]">
          <h1 className="text-[16px] font-bold text-[#0F172A]">Вход</h1>
          <p className="text-[10px] text-[#94A3B8] mb-4">Войдите в свой аккаунт</p>

          <form onSubmit={handleLogin}>
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
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>

          <div className="border-t border-[#F1F5F9] mt-4 pt-[13px]">
            <Link
              to="/register/trainer"
              className="text-[10px] font-semibold text-[#6366F1] block text-center mb-2"
            >
              Я тренер — зарегистрироваться
            </Link>
            <p className="text-[9px] text-[#94A3B8] text-center leading-relaxed">
              Клиент? Используйте ссылку-приглашение от тренера
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
