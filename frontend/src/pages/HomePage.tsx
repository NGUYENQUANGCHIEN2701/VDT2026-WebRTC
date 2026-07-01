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
      <section className="app-hero app-hero--compact" style={{ display: 'block', width: '100%', marginBottom: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <span className="app-kicker" style={{ textTransform: 'uppercase', letterSpacing: '1px', color: '#0f63ff', fontWeight: 600, fontSize: 13 }}>WELCOME</span>
          <h1 style={{ margin: '8px 0', fontSize: 32, display: 'flex', alignItems: 'center' }}>
            Xin chào, {user?.username}! <span style={{ fontSize: '32px', marginLeft: 8 }}>👋</span>
          </h1>
          <p style={{ color: 'var(--text)', fontSize: 15 }}>
            Chúc bạn một ngày làm việc hiệu quả! Hãy chọn người liên hệ bên dưới để bắt đầu cuộc trò chuyện.
          </p>
        </div>
      </section>

      <OnlineUsersList />
    </AppChrome>
  )
}
