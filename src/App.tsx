import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import RegisterTrainerPage from './pages/RegisterTrainerPage'
import RegisterClientPage from './pages/RegisterClientPage'
import TrainerDashboardPage from './pages/TrainerDashboardPage'
import ClientDashboardPage from './pages/ClientDashboardPage'
import CreateWorkoutPage from './pages/CreateWorkoutPage'
import WorkoutDetailPage from './pages/WorkoutDetailPage'
import DoWorkoutPage from './pages/DoWorkoutPage'
import ClientCardPage from './pages/ClientCardPage'
import InvitePage from './pages/InvitePage'
import AssignWorkoutFlow from './pages/AssignWorkoutFlow'
import SessionDetailPage from './pages/SessionDetailPage'
import ClientSessionPage from './pages/ClientSessionPage'

function RequireAuth({ children, role }: { children: React.ReactNode; role?: 'trainer' | 'client' }) {
  const { user, profile, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-500">Загрузка...</div>
    </div>
  )

  if (!user || !profile) return <Navigate to="/login" replace />
  if (role && profile.role !== role) {
    return <Navigate to={profile.role === 'trainer' ? '/trainer' : '/client'} replace />
  }
  return <>{children}</>
}

export default function App() {
  const { profile, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-500">Загрузка...</div>
    </div>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/login" element={
          profile ? <Navigate to={profile.role === 'trainer' ? '/trainer' : '/client'} replace /> : <LoginPage />
        } />
        <Route path="/register/trainer" element={<RegisterTrainerPage />} />
        <Route path="/register/client" element={<RegisterClientPage />} />

        <Route path="/trainer" element={
          <RequireAuth role="trainer"><TrainerDashboardPage /></RequireAuth>
        } />
        <Route path="/trainer/workout/new" element={
          <RequireAuth role="trainer"><CreateWorkoutPage /></RequireAuth>
        } />
        <Route path="/trainer/workout/:id/edit" element={
          <RequireAuth role="trainer"><CreateWorkoutPage /></RequireAuth>
        } />
        <Route path="/trainer/workout/:id" element={
          <RequireAuth role="trainer"><WorkoutDetailPage /></RequireAuth>
        } />
        <Route path="/trainer/client/:id" element={
          <RequireAuth role="trainer"><ClientCardPage /></RequireAuth>
        } />
        <Route path="/trainer/assign" element={
          <RequireAuth role="trainer"><AssignWorkoutFlow /></RequireAuth>
        } />
        <Route path="/trainer/session/:assignedWorkoutId" element={
          <RequireAuth role="trainer"><SessionDetailPage /></RequireAuth>
        } />

        <Route path="/client" element={
          <RequireAuth role="client"><ClientDashboardPage /></RequireAuth>
        } />
        <Route path="/client/workout/:assignedId" element={
          <RequireAuth role="client"><DoWorkoutPage /></RequireAuth>
        } />
        <Route path="/client/session/:assignedId" element={
          <RequireAuth role="client"><ClientSessionPage /></RequireAuth>
        } />

        <Route path="/" element={
          profile
            ? <Navigate to={profile.role === 'trainer' ? '/trainer' : '/client'} replace />
            : <Navigate to="/login" replace />
        } />
      </Routes>
    </BrowserRouter>
  )
}
