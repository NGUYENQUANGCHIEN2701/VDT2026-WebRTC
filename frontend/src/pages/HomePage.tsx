import { Link } from 'react-router-dom'
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

            <nav style={{ marginTop: 12, display: 'flex', gap: 16 }}>
                <Link to="/history" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    Lịch sử cuộc gọi
                </Link>
                {user?.role === 'ADMIN' && (
                    <Link to="/admin" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                        Quản trị
                    </Link>
                )}
            </nav>

            <div style={{ marginTop: 16 }}>
                <ConnectionIndicator />
            </div>
            <OnlineUsersList />
        </div>
    )
}