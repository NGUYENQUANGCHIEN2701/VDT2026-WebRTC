import { useState, type SyntheticEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import axios from "axios"
import { ArrowRightCircle, Eye, EyeOff, LockKeyhole, Mail, Moon, Plus, Sun, User, Video } from "lucide-react"
import api from "../api/axios"
import { useAuthTheme } from "../hooks/useAuthTheme"

export default function RegisterPage() {
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const { theme, toggleTheme } = useAuthTheme()
  const navigate = useNavigate()

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault()
    setError("")

    const trimmedUsername = username.trim()
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(trimmedUsername)) {
      setError("Tên đăng nhập phải dài 3-50 ký tự và chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Email không hợp lệ.")
      return
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Mật khẩu phải có ít nhất 8 ký tự, gồm chữ và số.")
      return
    }
    if (password !== confirmPassword) {
      setError("Xác nhận mật khẩu chưa khớp.")
      return
    }

    try {
      await api.post("/api/auth/register", {
        username: trimmedUsername,
        email: normalizedEmail,
        password,
        confirmPassword,
      })
      navigate(`/verify-email?email=${encodeURIComponent(normalizedEmail)}`)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const data = err.response.data
        setError(data.message || "Đăng ký thất bại")
      } else {
        setError("Đăng ký thất bại")
      }
    }
  }

  return (
    <main className={`auth-page auth-page--${theme}`}>
      <section className="auth-stage">
        <Link className="auth-brand" to="/login" aria-label="Video Call">
          <span className="auth-brand-mark">
            <Video size={25} strokeWidth={2.4} />
          </span>
          <span>
            Video <strong>Call</strong>
          </span>
        </Link>

        <button className="auth-theme-toggle" type="button" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          <span>{theme === "dark" ? "Sáng" : "Tối"}</span>
        </button>

        <div className="auth-card">
          <div className="auth-orb auth-orb--user" aria-hidden="true">
            <User size={46} strokeWidth={1.9} />
            <span>
              <Plus size={17} strokeWidth={2.5} />
            </span>
          </div>

          <header className="auth-header">
            <h1>Đăng ký</h1>
            <p>Tạo tài khoản để bắt đầu</p>
          </header>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Tên đăng nhập</span>
              <span className="auth-input-wrap">
                <User className="auth-input-icon" size={17} strokeWidth={1.8} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập tên đăng nhập"
                  autoComplete="username"
                  required
                />
              </span>
            </label>

            <label className="auth-field">
              <span>Email</span>
              <span className="auth-input-wrap">
                <Mail className="auth-input-icon" size={17} strokeWidth={1.8} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Nhập email của bạn"
                  autoComplete="email"
                  required
                />
              </span>
            </label>

            <label className="auth-field">
              <span>Mật khẩu</span>
              <span className="auth-input-wrap">
                <LockKeyhole className="auth-input-icon" size={17} strokeWidth={1.8} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tạo mật khẩu"
                  autoComplete="new-password"
                  required
                />
                <button
                  className="auth-ghost-button"
                  type="button"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            <label className="auth-field">
              <span>Xác nhận mật khẩu</span>
              <span className="auth-input-wrap">
                <LockKeyhole className="auth-input-icon" size={17} strokeWidth={1.8} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  autoComplete="new-password"
                  required
                />
              </span>
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button className="auth-submit" type="submit">
              <span>Đăng ký</span>
              <ArrowRightCircle size={20} strokeWidth={2} />
            </button>
          </form>

          <p className="auth-switch">
            Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
