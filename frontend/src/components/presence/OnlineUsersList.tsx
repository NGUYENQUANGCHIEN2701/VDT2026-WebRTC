import { useAuthStore } from '../../store/authStore'
import { usePresenceStore } from '../../store/presenceStore'
import OnlineUserRow from './OnlineUserRow'

export default function OnlineUsersList() {
    const onlineUsers = usePresenceStore((s) => s.onlineUsers)
    const connectionState = usePresenceStore((s) => s.connectionState)
    const me = useAuthStore((s) => s.user?.username)

    const others = onlineUsers.filter((u) => u.username !== me)

    const heading = (count?: number) => (
        <h2 style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 8, textAlign: 'left' }}>
            Đang trực tuyến{count === undefined ? '' : ` (${count})`}
        </h2>
    )

    // Loading: WS chưa từng open (chưa có snapshot)
    if (connectionState === 'connecting') {
        return (
            <section style={{ maxWidth: 480, marginTop: 24 }}>
                {heading()}
                <p style={{ fontSize: 14, color: 'var(--text)', textAlign: 'left' }}>Đang kết nối...</p>
            </section>
        )
    }

    // closed = mất kết nối → giữ list cũ nhưng làm mờ (không clear)
    const dim = connectionState === 'closed'

    return (
        <section style={{ maxWidth: 480, marginTop: 24, opacity: dim ? 0.6 : 1 }}>
            {heading(others.length)}
            {others.length === 0 ? (
                <div style={{ paddingTop: 32, textAlign: 'center' }}>
                    <p style={{ fontSize: 16, color: 'var(--text-h)' }}>Chưa có ai trực tuyến</p>
                    <p style={{ fontSize: 14, color: 'var(--text)' }}>
                        Hiện chưa có người dùng nào khác đang trực tuyến. Danh sách sẽ tự cập nhật khi có người tham gia.
                    </p>
                </div>
            ) : (
                <ul style={{ margin: 0, padding: 0 }}>
                    {others.map((u) => (
                        <OnlineUserRow key={u.username} user={u} />
                    ))}
                </ul>
            )}
        </section>
    )
}
