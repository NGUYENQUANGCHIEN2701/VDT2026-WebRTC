import { ChevronRight, Users } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { startGroupInvite } from "../../realtime/roomActions"
import { useAuthStore } from "../../store/authStore"
import { useCallStore } from "../../store/callStore"
import { usePresenceStore } from "../../store/presenceStore"
import { useRoomStore } from "../../store/roomStore"
import MultiSelectUserList from "./MultiSelectUserList"
import OnlineUserRow from "./OnlineUserRow"

export default function OnlineUsersList() {
  const onlineUsers = usePresenceStore((s) => s.onlineUsers)
  const connectionState = usePresenceStore((s) => s.connectionState)
  const me = useAuthStore((s) => s.user?.username)
  const callActive = useCallStore((s) => s.callState) !== "idle"
  const roomBusy = useRoomStore((s) => s.roomId != null || s.outgoingInvitees.length > 0)
  const [groupMode, setGroupMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  const others = onlineUsers.filter((u) => u.username !== me)
  const canStartGroup = !callActive && !roomBusy && others.some((u) => u.status === "ONLINE")

  const toggleSelected = (username: string) => {
    setSelected((current) => {
      if (current.includes(username)) return current.filter((u) => u !== username)
      if (current.length >= 3) return current
      return [...current, username]
    })
  }

  const cancelGroupMode = () => {
    setGroupMode(false)
    setSelected([])
  }

  const confirmGroupInvite = () => {
    startGroupInvite(selected)
    cancelGroupMode()
  }

  if (connectionState === "connecting") {
    return (
      <div className="app-panel">
        <div className="app-panel-header">
          <h2>Người trực tuyến</h2>
        </div>
        <div style={{ padding: 24, color: 'var(--text)' }}>Đang kết nối...</div>
      </div>
    )
  }

  const dim = connectionState === "closed"

  return (
    <div className="app-panel" style={{ opacity: dim ? 0.7 : 1 }}>
      <div className="app-panel-header">
        <h2>Người trực tuyến ({others.length})</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {groupMode ? (
            <>
              <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 700 }}>Đã chọn: {selected.length}/3</span>
              <button className="app-button app-button--ghost app-button--sm" type="button" onClick={cancelGroupMode}>Hủy</button>
            </>
          ) : (
            <>
              {canStartGroup && (
                <button className="home-history-btn" type="button" onClick={() => setGroupMode(true)} style={{ color: 'var(--accent)', borderColor: 'var(--accent-border)' }}>
                  <Users size={16} />
                  Gọi nhóm
                </button>
              )}
              <Link to="/history" className="home-history-btn">
                Lịch sử cuộc gọi
                <ChevronRight size={16} />
              </Link>
            </>
          )}
        </div>
      </div>

      {others.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text)' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, color: 'var(--text-h)' }}>Chưa có ai trực tuyến</p>
          <p style={{ margin: 0 }}>Danh sách sẽ tự cập nhật khi có người dùng khác tham gia.</p>
        </div>
      ) : groupMode ? (
        <>
          <MultiSelectUserList users={others} selected={selected} onToggle={toggleSelected} />
          <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="app-button" type="button" disabled={selected.length === 0} onClick={confirmGroupInvite}>
              Mời {selected.length} người
            </button>
          </div>
        </>
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
