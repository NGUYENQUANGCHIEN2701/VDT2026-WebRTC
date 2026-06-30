import { Phone, Users } from "lucide-react"
import AppChrome from "../components/AppChrome"
import OnlineUsersList from "../components/presence/OnlineUsersList"
import SessionKickNotice from "../components/presence/SessionKickNotice"
import { useAuthStore } from "../store/authStore"
import { usePresenceStore } from "../store/presenceStore"

export default function HomePage() {
  const user = useAuthStore((state) => state.user)
  const kicked = usePresenceStore((s) => s.kicked)

  if (kicked) {
    return <SessionKickNotice />
  }

  const scrollToUsers = () => {
    const el = document.querySelector('.home-panel')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <AppChrome>
      <section className="app-hero app-hero--compact">
        <div>
          <span className="app-kicker" style={{ textTransform: 'uppercase', letterSpacing: '1px' }}>Welcome</span>
          <h1>
            Xin chào, {user?.username}! <span style={{ fontSize: '32px', marginLeft: 8 }}>👋</span>
          </h1>
          <p>Chúc bạn một ngày làm việc hiệu quả! Hãy chọn người liên hệ bên dưới để bắt đầu cuộc trò chuyện.</p>
        </div>
        <div className="app-hero-actions">
          <button className="app-button app-button--ghost" style={{ borderRadius: '999px', color: 'var(--accent)', borderColor: 'var(--accent-border)' }} onClick={scrollToUsers}>
            <Phone size={17} />
            Gọi cá nhân
          </button>
          <button className="app-button" style={{ borderRadius: '999px', backgroundColor: '#16a34a', borderColor: '#16a34a' }} onClick={scrollToUsers}>
            <Users size={17} />
            Gọi nhóm
          </button>
        </div>
      </section>

      <OnlineUsersList />
    </AppChrome>
  )
}
