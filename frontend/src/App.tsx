import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ProtectedRoute from './routes/ProtectedRoute'
import AdminPage from './pages/AdminPage'
import { useAuthStore } from './store/authStore'
import axios from 'axios'
import { useEffect, useRef } from 'react'
import api from './api/axios'
import HomePage from './pages/HomePage'
import { connectWs } from './realtime/wsClient'
import './realtime/roomActions'
import CallPage from './pages/CallPage'
import GroupCallPage from './pages/GroupCallPage'
import CallLayer from './components/call/CallLayer'
import GroupInviteModal from './components/call/GroupInviteModal'
import OutgoingGroupInviteCard from './components/call/OutgoingGroupInviteCard'
import Toaster from './components/Toaster'
import Ringtone from './components/call/Ringtone'
import HistoryPage from './pages/HistoryPage'
import { acceptRoomInvite, cancelGroupInvite, declineRoomInvite } from './realtime/roomActions'
import { useRoomStore } from './store/roomStore'

function App() {
  const setAuth = useAuthStore((state) => state.setAuth)
  const setLoading = useAuthStore((state) => state.setLoading)
  const didRestore = useRef(false)
  const token = useAuthStore((state) => state.token)
  const didConnect = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()
  const roomId = useRoomStore((s) => s.roomId)
  const incomingInvite = useRoomStore((s) => s.incomingInvite)
  const outgoingInvitees = useRoomStore((s) => s.outgoingInvitees)
  const declinedInvitees = useRoomStore((s) => s.declinedInvitees)
  const members = useRoomStore((s) => s.members)

  useEffect(() => {
    if (roomId && location.pathname !== '/group-call') {
      navigate('/group-call')
    } else if (!roomId && location.pathname === '/group-call') {
      navigate('/')
    }
  }, [roomId, location.pathname, navigate])

  useEffect(() => {
    // StrictMode chạy effect 2 lần trong dev → chặn mở 2 WebSocket (2 session tự đá nhau)
    if (!token) {
      didConnect.current = false
      return
    }
    if (didConnect.current) return
    didConnect.current = true
    connectWs()
  }, [token])

  // StrictMode chạy effect 2 lần trong dev → chặn restore() chạy trùng
  // (lần 2 sẽ gửi lại cookie đã bị rotation revoke → 401 → đá ra login)
  useEffect(() => {
    if (didRestore.current) return
    didRestore.current = true

    const restore = async () => {
      try {
        const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
        const res = await axios.post(
          `${apiBase}/api/auth/refresh`,
          {},
          { withCredentials: true }   // bắt buộc để gửi cookie
        )
        const token = res.data.token as string

        useAuthStore.getState().setToken(token)
        const me = await api.get('/api/users/me')

        setAuth(token, { username: me.data.username, role: me.data.role })
      } catch {
        // Không có phiên hợp lệ → coi như chưa đăng nhập
        useAuthStore.getState().logout()
      } finally {
        // Dù thành hay bại: báo "đã kiểm tra xong" → route được phép quyết định
        setLoading(false)
      }
    }

    restore()
  }, [setAuth, setLoading])
  return (
    <>
      <CallLayer />
      {incomingInvite && (
        <GroupInviteModal
          initiatorUsername={incomingInvite.from}
          memberCount={incomingInvite.invitees.length + 1}
          onAccept={acceptRoomInvite}
          onReject={declineRoomInvite}
        />
      )}
      {outgoingInvitees.length > 0 && !roomId && (
        <OutgoingGroupInviteCard
          invitees={outgoingInvitees}
          joined={Object.keys(members)}
          declined={declinedInvitees}
          onCancel={cancelGroupInvite}
        />
      )}
      <Toaster />
      <Ringtone />
      <Routes>
        <Route path="/admin" element={
          <ProtectedRoute requiredRole="ADMIN"><AdminPage /></ProtectedRoute>
        } />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={
          <ProtectedRoute><HomePage /></ProtectedRoute>
        } />
        <Route path="/call" element={
          <ProtectedRoute><CallPage /></ProtectedRoute>
        } />
        <Route path="/group-call" element={
          <ProtectedRoute><GroupCallPage /></ProtectedRoute>
        } />
        <Route path="/history" element={
          <ProtectedRoute><HistoryPage /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}
export default App
