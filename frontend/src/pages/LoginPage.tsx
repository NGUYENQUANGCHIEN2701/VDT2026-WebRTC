import { useState, type SyntheticEvent } from "react"
import { useAuthStore } from "../store/authStore"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import api from "../api/axios"

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const setAuth = useAuthStore((state) => state.setAuth)
  const navigate = useNavigate()

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault()
    try {
      const res = await api.post('/api/auth/login', { username, password })
      setAuth(res.data.token, { username: res.data.username, role: res.data.role })
      navigate('/')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 403) {
          setError('Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.')
          return
        }
        setError(err.response?.data?.message ?? 'Đăng nhập thất bại. Vui lòng thử lại.')
        return
      }
      setError('Đăng nhập thất bại. Vui lòng thử lại.')
    }
  }
  return (
    <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Đăng nhập</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </div>

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <button type="submit" style={{ width: '100%', padding: 10 }}>
          Đăng nhập
        </button>
      </form>

      <p>
        Chưa có tài khoản? <a href="/register">Đăng ký</a>
      </p>
    </div>
  )

}
