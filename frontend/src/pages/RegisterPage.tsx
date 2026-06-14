import { useState, type SyntheticEvent } from "react"
import { useNavigate } from "react-router-dom"
import api from "../api/axios"
import axios from "axios"

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const navigate = useNavigate()

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault()
    try {
      await api.post('/api/auth/register', { username, email, password })
      navigate('/login')
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const data = err.response.data
        setError(data.message || 'Đăng ký thất bại')
      }
      else {
        setError('Đăng ký thất bại')
      }
    }
  }
  return (
    <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Đăng ký</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Username</label>
          <input type="text" value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Password</label>
          <input type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 8 }} />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" style={{ width: '100%', padding: 10 }}>Đăng ký</button>
      </form>
      <p>Đã có tài khoản? <a href="/login">Đăng nhập</a></p>
    </div>
  )

}
