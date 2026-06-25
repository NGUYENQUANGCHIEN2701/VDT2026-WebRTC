import { startCall } from '../../realtime/callActions'
import type { OnlineUser, PresenceStatus } from '../../realtime/messages'
import { useAuthStore } from '../../store/authStore'
import { useCallStore } from '../../store/callStore'
import StatusBadge from './StatusBadge'

// Màu chấm (trang trí); ý nghĩa do StatusBadge text mang.
const DOT: Record<PresenceStatus, string> = { ONLINE: '#16a34a', IN_CALL: '#d97706' }

export default function OnlineUserRow({ user }: { user: OnlineUser }) {
    const me = useAuthStore((s) => s.user?.username)
    const callActive = useCallStore((s) => s.callState) !== 'idle'
    const canCall = user.status === 'ONLINE' && user.username !== me

    return (
        <li style={{ /* giữ nguyên style cũ */ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', listStyle: 'none' }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[user.status] }} />
            <span style={{ flex: 1, fontSize: 16, color: 'var(--text-h)', textAlign: 'left' }}>{user.username}</span>
            <StatusBadge status={user.status} />
            {canCall && (
                <button onClick={() => startCall(user.username)} disabled={callActive}
                    style={{
                        fontSize: 14, fontWeight: 600, color: 'var(--accent)', background: 'transparent',
                        border: '1px solid var(--accent-border)', borderRadius: 4, padding: '4px 8px',
                        cursor: callActive ? 'not-allowed' : 'pointer', opacity: callActive ? 0.4 : 1,
                    }}>
                    Gọi
                </button>
            )}
        </li>
    )
}