import type { OnlineUser, PresenceStatus } from '../../realtime/messages'
import StatusBadge from './StatusBadge'

// Màu chấm (trang trí); ý nghĩa do StatusBadge text mang.
const DOT: Record<PresenceStatus, string> = { ONLINE: '#16a34a', IN_CALL: '#d97706' }

export default function OnlineUserRow({ user }: { user: OnlineUser }) {
    return (
        <li
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderBottom: '1px solid var(--border)',
                listStyle: 'none',
            }}
        >
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[user.status] }} />
            <span style={{ flex: 1, fontSize: 16, color: 'var(--text-h)', textAlign: 'left' }}>{user.username}</span>
            <StatusBadge status={user.status} />
        </li>
    )
}
