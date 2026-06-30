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
      <div className="home-page">
        <header className="home-header">
          <h1>
            Xin chào, {user?.username}! 
            <span style={{ fontSize: 24 }}>👋</span>
          </h1>
          <p>Chúc bạn một ngày làm việc hiệu quả!</p>
        </header>

        <OnlineUsersList />
      </div>
    </AppChrome>
  )
}
