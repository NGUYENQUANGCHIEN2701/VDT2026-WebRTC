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
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const { theme, toggleTheme } = useAuthTheme()
  const navigate = useNavigate()

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault()
    setError("")

    try {
      await api.post("/api/auth/register", { username, email, password })
      navigate("/login")
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
              <span>Username</span>
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
              <span>Password</span>
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
