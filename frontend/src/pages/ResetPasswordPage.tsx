import { useMemo, useState, type SyntheticEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import axios from "axios"
import { ArrowRightCircle, Eye, EyeOff, LockKeyhole, Moon, ShieldCheck, Sun, Video } from "lucide-react"
import api from "../api/axios"
import { useAuthTheme } from "../hooks/useAuthTheme"

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự."
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Mật khẩu phải có ít nhất một chữ cái và một chữ số."
  }
  return null
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams])
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { theme, toggleTheme } = useAuthTheme()
  const navigate = useNavigate()

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault()
    setError("")
    setMessage("")

    if (!token) {
      setError("Liên kết đặt lại mật khẩu không hợp lệ.")
      return
    }

    const validationError = validatePassword(password)
    if (validationError) {
      setError(validationError)
      return
    }
    if (password !== confirmPassword) {
      setError("Xác nhận mật khẩu chưa khớp.")
      return
    }

    setIsSubmitting(true)
    try {
      await api.post("/api/auth/reset-password", { token, password, confirmPassword })
      setMessage("Mật khẩu đã được cập nhật. Đang chuyển về đăng nhập...")
      window.setTimeout(() => navigate("/login", { replace: true }), 900)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message ?? "Không thể đặt lại mật khẩu.")
        return
      }
      setError("Không thể đặt lại mật khẩu.")
    } finally {
      setIsSubmitting(false)
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
          <div className="auth-orb auth-orb--lock" aria-hidden="true">
            <ShieldCheck size={54} strokeWidth={1.7} />
          </div>

          <header className="auth-header">
            <h1>Đặt lại mật khẩu</h1>
            <p>Chọn mật khẩu mới cho tài khoản của bạn</p>
          </header>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Mật khẩu mới</span>
              <span className="auth-input-wrap">
                <LockKeyhole className="auth-input-icon" size={17} strokeWidth={1.8} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Tối thiểu 8 ký tự, có chữ và số"
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
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  autoComplete="new-password"
                  required
                />
              </span>
            </label>

            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-success">{message}</p>}

            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              <span>{isSubmitting ? "Đang cập nhật..." : "Cập nhật mật khẩu"}</span>
              <ArrowRightCircle size={20} strokeWidth={2} />
            </button>
          </form>

          <p className="auth-switch">
            Quay lại <Link to="/login">đăng nhập</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
