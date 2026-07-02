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


  return (
    <AppChrome>
      <section className="home-hero" style={{ marginBottom: 32, width: '100%' }}>
        <span className="app-kicker" style={{ textTransform: 'uppercase', letterSpacing: '1px', color: '#0f63ff', fontWeight: 600, fontSize: 13 }}>WELCOME</span>
        <h1 className="home-hero-title">
          Xin chào, {user?.username}! <span style={{ fontSize: '1em', marginLeft: 6 }}>👋</span>
        </h1>
        <p className="home-hero-desc">
          Chúc bạn một ngày làm việc hiệu quả! Hãy chọn người liên hệ bên dưới để bắt đầu cuộc trò chuyện.
        </p>
      </section>

      <OnlineUsersList />
    </AppChrome>
  )
}

