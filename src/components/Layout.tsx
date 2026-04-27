import { Dumbbell, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const homeUrl = profile?.role === 'client' ? '/client' : '/trainer'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(homeUrl)} className="flex items-center gap-2 hover:opacity-75 transition-opacity">
            <Dumbbell className={`w-6 h-6 ${profile?.role === 'client' ? 'text-emerald-600' : 'text-indigo-600'}`} />
            <span className="font-semibold">FitTrainer</span>
          </button>
          {profile && (
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-600 hidden sm:block">
                {profile.name}
                <span className="text-slate-400 ml-1">
                  · {profile.role === 'trainer' ? 'тренер' : 'клиент'}
                </span>
              </div>
              <button
                onClick={signOut}
                className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
              >
                <LogOut className="w-4 h-4" /> Выйти
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
