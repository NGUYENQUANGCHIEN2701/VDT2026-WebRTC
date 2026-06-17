import { useLogout } from "../hooks/useLogout"
import { useAuthStore } from "../store/authStore"
import ConnectionIndicator from '../components/presence/ConnectionIndicator'
import OnlineUsersList from '../components/presence/OnlineUsersList'
import SessionKickNotice from "../components/presence/SessionKickNotice"
import { usePresenceStore } from '../store/presenceStore'

export default function HomePage() {
    const user = useAuthStore((state) => state.user)
    const logout = useLogout()
    const kicked = usePresenceStore((s) => s.kicked)
    if (kicked) {
        return <SessionKickNotice />
    }
    return (
        <div style={{ padding: 24 }}>
            <h1>Xin chào, {user?.username}</h1>
            <p>Role: {user?.role}</p>
            <button onClick={logout}>Đăng xuất</button>

            <div style={{ marginTop: 16 }}>
                <ConnectionIndicator />
            </div>
            <OnlineUsersList />
        </div>
    )
}