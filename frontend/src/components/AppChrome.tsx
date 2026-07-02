import type { ReactNode } from "react"
import { NavLink } from "react-router-dom"
import { History, Home, LogOut, Menu, Moon, Shield, Sun, Video, X } from "lucide-react"
import { useAuthTheme } from "../hooks/useAuthTheme"
import { useLogout } from "../hooks/useLogout"
import { useAuthStore } from "../store/authStore"
import { useState, useEffect } from "react"
import { useLocation } from "react-router-dom"

export default function AppChrome({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useAuthTheme()
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  // Đóng drawer khi chuyển trang
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // Ngăn scroll body khi drawer mở
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [drawerOpen])

  return (
    <main className={`app-shell app-theme--${theme}`}>
      {/* Overlay backdrop cho mobile drawer */}
      {drawerOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`app-sidebar${drawerOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar-top">
          <NavLink className="sidebar-brand" to="/" aria-label="Video Call">
            <span className="sidebar-logo">
              <Video size={21} strokeWidth={2.4} />
            </span>
            <span>Video <strong>Call</strong></span>
          </NavLink>

          {/* Nút đóng drawer – chỉ hiện trên mobile */}
          <button
            className="sidebar-close-btn"
            onClick={() => setDrawerOpen(false)}
            type="button"
            aria-label="Đóng menu"
          >
            <X size={20} />
          </button>
        </div>

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
        {/* Mobile top bar */}
        <div className="mobile-topbar">
          <NavLink className="sidebar-brand mobile-topbar-brand" to="/" aria-label="Video Call">
            <span className="sidebar-logo">
              <Video size={18} strokeWidth={2.4} />
            </span>
            <span>Video <strong>Call</strong></span>
          </NavLink>
          <button
            className="mobile-menu-btn"
            onClick={() => setDrawerOpen(true)}
            type="button"
            aria-label="Mở menu"
          >
            <Menu size={22} />
          </button>
        </div>

        {children}
      </div>
    </main>
  )
}
