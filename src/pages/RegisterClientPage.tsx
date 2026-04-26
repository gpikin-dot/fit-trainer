import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Input, ErrorMessage } from '../components/UI'

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
    })

    if (authError || !data.user) {
      setError(authError?.message === 'User already registered'
        ? 'Этот email уже зарегистрирован'
        : (authError?.message ?? 'Ошибка регистрации'))
      setLoading(false)
      return
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      name: name.trim(),
      role: 'client',
      trainer_id: invite.trainer_id,
    })

    if (profileError) {
      setError('Ошибка создания профиля')
      setLoading(false)
      return
    }

    await supabase.from('invites').update({ used_by: data.user.id }).eq('token', token)

    sessionStorage.removeItem('invite_token')
    sessionStorage.removeItem('invite_trainer_name')

    navigate('/client', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold mb-1">Регистрация клиента</h1>
          {trainerName && (
            <p className="text-sm text-slate-600 mb-5">
              Вас приглашает тренер <span className="font-medium">{trainerName}</span>
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input label="Имя" value={name} onChange={setName} placeholder="Иван Иванов" required />
            <Input label="Email" value={email} onChange={setEmail} type="email" required />
            <Input label="Пароль" value={password} onChange={setPassword} type="password" required />
            {error && <ErrorMessage text={error} />}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Создание аккаунта...' : 'Зарегистрироваться'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
