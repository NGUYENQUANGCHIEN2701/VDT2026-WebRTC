import { useState, type SyntheticEvent } from "react"
import { Link } from "react-router-dom"
import axios from "axios"
import { ArrowRightCircle, Mail, Moon, ShieldCheck, Sun, Video } from "lucide-react"
import api from "../api/axios"
import { useAuthTheme } from "../hooks/useAuthTheme"

type ForgotPasswordResponse = {
  message: string
  resetToken: string | null
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { theme, toggleTheme } = useAuthTheme()

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault()
    setError("")
    setMessage("")
    setResetToken(null)

    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Email không hợp lệ.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await api.post<ForgotPasswordResponse>("/api/auth/forgot-password", {
        email: normalizedEmail,
      })
      setMessage("Nếu email tồn tại, hệ thống đã tạo liên kết đặt lại mật khẩu.")
      setResetToken(res.data.resetToken)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message ?? "Không thể tạo yêu cầu đặt lại mật khẩu.")
        return
      }
      setError("Không thể tạo yêu cầu đặt lại mật khẩu.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetLink = resetToken ? `/reset-password?token=${encodeURIComponent(resetToken)}` : null

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
          <div className="auth-orb auth-orb--lock" aria-hidden="true">
            <ShieldCheck size={54} strokeWidth={1.7} />
          </div>

          <header className="auth-header">
            <h1>Quên mật khẩu</h1>
            <p>Nhập email để tạo liên kết đặt lại mật khẩu</p>
          </header>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Email</span>
              <span className="auth-input-wrap">
                <Mail className="auth-input-icon" size={17} strokeWidth={1.8} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Nhập email của bạn"
                  autoComplete="email"
                  required
                />
              </span>
            </label>

            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-success">{message}</p>}
            {resetLink && (
              <p className="auth-help">
                Demo token đã bật. <Link to={resetLink}>Đặt lại mật khẩu ngay</Link>
              </p>
            )}

            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              <span>{isSubmitting ? "Đang gửi..." : "Tạo liên kết"}</span>
              <ArrowRightCircle size={20} strokeWidth={2} />
            </button>
          </form>

          <p className="auth-switch">
            Đã nhớ mật khẩu? <Link to="/login">Đăng nhập</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
