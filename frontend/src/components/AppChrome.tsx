import type { ReactNode } from "react"
import { NavLink } from "react-router-dom"
import { History, Home, LogOut, Moon, Shield, Sun, Video } from "lucide-react"
import { useAuthTheme } from "../hooks/useAuthTheme"
import { useLogout } from "../hooks/useLogout"
import { useAuthStore } from "../store/authStore"

export default function AppChrome({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useAuthTheme()
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()

  return (
    <main className={`app-shell app-theme--${theme}`}>
      <aside className="app-sidebar">
        <NavLink className="sidebar-brand" to="/" aria-label="Video Call">
          <span className="sidebar-logo">
            <Video size={21} strokeWidth={2.4} />
          </span>
          <span>Video <strong>Call</strong></span>
        </NavLink>

        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          <NavLink to="/" end>
            <Home size={17} />
            Trang chủ
          </NavLink>
          <NavLink to="/history">
            <History size={17} />
            Lịch sử
          </NavLink>
          {user?.role === "ADMIN" && (
            <NavLink to="/admin">
              <Shield size={17} />
              Quản trị
            </NavLink>
          )}
        </nav>

        <div className="sidebar-actions">
          <button className="sidebar-icon-button" onClick={toggleTheme} type="button">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            <span>{theme === "dark" ? "Sáng" : "Tối"}</span>
          </button>
          <button className="sidebar-icon-button" onClick={logout} type="button">
            <LogOut size={17} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      <div className="app-content">
        {children}
      </div>
    </main>
  )
}
