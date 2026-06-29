import { ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"
import { useAuthStore } from "../../store/authStore"
import { usePresenceStore } from "../../store/presenceStore"
import OnlineUserRow from "./OnlineUserRow"

export default function OnlineUsersList() {
  const onlineUsers = usePresenceStore((s) => s.onlineUsers)
  const connectionState = usePresenceStore((s) => s.connectionState)
  const me = useAuthStore((s) => s.user?.username)

  const others = onlineUsers.filter((u) => u.username !== me)

  if (connectionState === "connecting") {
    return (
      <div className="home-panel">
        <div className="home-panel-header">
          <h2 className="home-panel-title">Người trực tuyến</h2>
        </div>
        <div style={{ padding: 24, color: 'var(--text)' }}>Đang kết nối...</div>
      </div>
    )
  }

  const dim = connectionState === "closed"

  return (
    <div className="home-panel" style={{ opacity: dim ? 0.7 : 1 }}>
      <div className="home-panel-header">
        <h2 className="home-panel-title">Người trực tuyến ({others.length})</h2>
        <Link to="/history" className="home-history-btn">
          Lịch sử cuộc gọi
          <ChevronRight size={16} />
        </Link>
      </div>

      {others.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text)' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, color: 'var(--text-h)' }}>Chưa có ai trực tuyến</p>
          <p style={{ margin: 0 }}>Danh sách sẽ tự cập nhật khi có người dùng khác tham gia.</p>
        </div>
      ) : (
        <ul className="home-user-list">
          {others.map((u) => (
            <OnlineUserRow key={u.username} user={u} />
          ))}
        </ul>
      )}
    </div>
  )
}
