import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Input, ErrorMessage } from '../components/UI'

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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Dumbbell className="w-8 h-8 text-indigo-600" />
          <span className="text-2xl font-bold">FitTrainer</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold mb-1">Вход</h1>
          <p className="text-sm text-slate-500 mb-5">Войдите в свой аккаунт</p>

          <form onSubmit={handleLogin} className="space-y-3">
            <Input label="Email" value={email} onChange={setEmail} type="email" required />
            <Input label="Пароль" value={password} onChange={setPassword} type="password" required />
            {error && <ErrorMessage text={error} />}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-slate-100 space-y-2 text-center">
            <Link to="/register/trainer" className="block text-sm text-indigo-600 hover:text-indigo-800">
              Я тренер — зарегистрироваться
            </Link>
            <p className="text-sm text-slate-500">
              Клиент? Используйте ссылку-приглашение от тренера
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
