import { useMemo, useState, type SyntheticEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import axios from "axios"
import { ArrowRightCircle, KeyRound, Mail, Moon, ShieldCheck, Sun, Video } from "lucide-react"
import api from "../api/axios"
import { useAuthTheme } from "../hooks/useAuthTheme"

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const initialEmail = useMemo(() => searchParams.get("email") ?? "", [searchParams])
  const [email, setEmail] = useState(initialEmail)
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const { theme, toggleTheme } = useAuthTheme()
  const navigate = useNavigate()

  const normalizedEmail = email.trim().toLowerCase()

  const validate = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return "Email không hợp lệ."
    }
    if (!/^\d{6}$/.test(otp.trim())) {
      return "OTP phải gồm đúng 6 chữ số."
    }
    return null
  }

  const handleSubmit = async (event: SyntheticEvent) => {
    event.preventDefault()
    setError("")
    setMessage("")

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSubmitting(true)
    try {
      await api.post("/api/auth/verify-email", {
        email: normalizedEmail,
        otp: otp.trim(),
      })
      setMessage("Email đã được xác minh. Đang chuyển về đăng nhập...")
      window.setTimeout(() => navigate("/login", { replace: true }), 900)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message ?? "Không thể xác minh OTP.")
        return
      }
      setError("Không thể xác minh OTP.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResend = async () => {
    setError("")
    setMessage("")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Nhập email hợp lệ trước khi gửi lại OTP.")
      return
    }

    setIsResending(true)
    try {
      await api.post("/api/auth/resend-verification-otp", { email: normalizedEmail })
      setMessage("Nếu email cần xác minh, OTP mới đã được gửi.")
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message ?? "Không thể gửi lại OTP.")
        return
      }
      setError("Không thể gửi lại OTP.")
    } finally {
      setIsResending(false)
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
            <h1>Xác minh email</h1>
            <p>Nhập mã OTP 6 chữ số đã được gửi tới email của bạn</p>
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

            <label className="auth-field">
              <span>OTP</span>
              <span className="auth-input-wrap">
                <KeyRound className="auth-input-icon" size={17} strokeWidth={1.8} />
                <input
                  type="text"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </span>
            </label>

            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-success">{message}</p>}

            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              <span>{isSubmitting ? "Đang xác minh..." : "Xác minh email"}</span>
              <ArrowRightCircle size={20} strokeWidth={2} />
            </button>

            <button className="auth-google-fallback" type="button" onClick={handleResend} disabled={isResending}>
              {isResending ? "Đang gửi lại..." : "Gửi lại OTP"}
            </button>
          </form>

          <p className="auth-switch">
            Đã xác minh? <Link to="/login">Đăng nhập</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
