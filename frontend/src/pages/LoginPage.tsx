import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import axios from "axios"
import { ArrowRightCircle, Eye, EyeOff, LockKeyhole, Moon, ShieldCheck, Sun, User, Video } from "lucide-react"
import api from "../api/axios"
import { useAuthTheme } from "../hooks/useAuthTheme"
import { useAuthStore } from "../store/authStore"

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: { credential?: string }) => void
          }) => void
          renderButton: (
            element: HTMLElement,
            options: { theme: "outline", size: "large", width: number, text: "signin_with" },
          ) => void
        }
      }
    }
  }
}

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const setAuth = useAuthStore((state) => state.setAuth)
  const { theme, toggleTheme } = useAuthTheme()
  const navigate = useNavigate()
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

  const finishLogin = useCallback((data: { token: string, username: string, role: string }) => {
    setAuth(data.token, { username: data.username, role: data.role })
    navigate("/")
  }, [navigate, setAuth])

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault()
    setError("")

    try {
      const res = await api.post("/api/auth/login", { username, password })
      finishLogin(res.data)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 403) {
          if (err.response.data?.fieldErrors?.reason === "EMAIL_NOT_VERIFIED") {
            const email = err.response.data.fieldErrors.email as string | undefined
            const suffix = email ? `?email=${encodeURIComponent(email)}` : ""
            navigate(`/verify-email${suffix}`)
            return
          }
          setError("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.")
          return
        }
        setError(err.response?.data?.message ?? "Đăng nhập thất bại. Vui lòng thử lại.")
        return
      }
      setError("Đăng nhập thất bại. Vui lòng thử lại.")
    }
  }

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return

    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          if (!credential) {
            setError("Google không trả về thông tin đăng nhập.")
            return
          }
          setError("")
          try {
            const res = await api.post("/api/auth/google", { credential })
            finishLogin(res.data)
          } catch (err) {
            if (axios.isAxiosError(err)) {
              setError(err.response?.data?.message ?? "Đăng nhập Google thất bại.")
              return
            }
            setError("Đăng nhập Google thất bại.")
          }
        },
      })
      googleButtonRef.current.innerHTML = ""
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "signin_with",
      })
    }

    if (window.google) {
      renderGoogleButton()
      return
    }

    const existing = document.getElementById("google-identity-script")
    if (existing) {
      existing.addEventListener("load", renderGoogleButton, { once: true })
      return
    }

    const script = document.createElement("script")
    script.id = "google-identity-script"
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.defer = true
    script.addEventListener("load", renderGoogleButton, { once: true })
    document.head.appendChild(script)
  }, [finishLogin, googleClientId])

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
            <h1>Đăng nhập</h1>
            <p>Chào mừng bạn quay trở lại!</p>
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
              <span>Mật khẩu</span>
              <span className="auth-input-wrap">
                <LockKeyhole className="auth-input-icon" size={17} strokeWidth={1.8} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
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

            <div className="auth-row">
              <label className="auth-check">
                <input type="checkbox" defaultChecked />
                <span>Ghi nhớ đăng nhập</span>
              </label>
              <Link to="/forgot-password">Quên mật khẩu?</Link>
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button className="auth-submit" type="submit">
              <span>Đăng nhập</span>
              <ArrowRightCircle size={20} strokeWidth={2} />
            </button>
          </form>

          <div className="auth-divider"><span>hoặc</span></div>
          {googleClientId ? (
            <div className="auth-google-slot" ref={googleButtonRef} />
          ) : (
            <button className="auth-google-fallback" type="button" disabled>
              Google chưa được cấu hình
            </button>
          )}

          <p className="auth-switch">
            Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
