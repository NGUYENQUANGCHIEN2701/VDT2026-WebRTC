import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProtectedRoute from './routes/ProtectedRoute'
import AdminPage from './pages/AdminPage'
import { useAuthStore } from './store/authStore'
import axios from 'axios'
import { useEffect, useRef } from 'react'
import api from './api/axios'
import HomePage from './pages/HomePage'

function App() {
  const setAuth = useAuthStore((state) => state.setAuth)
  const setLoading = useAuthStore((state) => state.setLoading)
  const didRestore = useRef(false)

  useEffect(() => {
    // StrictMode chạy effect 2 lần trong dev → chặn restore() chạy trùng
    // (lần 2 sẽ gửi lại cookie đã bị rotation revoke → 401 → đá ra login)
    if (didRestore.current) return
    didRestore.current = true

    const restore = async () => {
      try {
        const res = await axios.post(
          `${import.meta.env.VITE_API_URL}/api/auth/refresh`,
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
    <Routes>
      <Route path="/admin" element={
        <ProtectedRoute requiredRole="ADMIN"><AdminPage /></ProtectedRoute>
      } />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={
        <ProtectedRoute><HomePage /></ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App