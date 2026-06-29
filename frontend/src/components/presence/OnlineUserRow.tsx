import { Phone } from "lucide-react"
import { startCall } from "../../realtime/callActions"
import type { OnlineUser, PresenceStatus } from "../../realtime/messages"
import { useAuthStore } from "../../store/authStore"
import { useCallStore } from "../../store/callStore"

function getAvatarColor(username: string) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e']
  const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[index % colors.length]
}

const STATUS_TEXT: Record<PresenceStatus, string> = {
  ONLINE: "Trực tuyến",
  IN_CALL: "Đang bận",
}

const STATUS_CLASS: Record<PresenceStatus, string> = {
  ONLINE: "online",
  IN_CALL: "busy",
}

export default function OnlineUserRow({ user }: { user: OnlineUser }) {
  const me = useAuthStore((s) => s.user?.username)
  const callActive = useCallStore((s) => s.callState) !== "idle"
  const canCall = user.status === "ONLINE" && user.username !== me

  const initial = user.username.charAt(0).toUpperCase()
  const avatarColor = getAvatarColor(user.username)
  const statusClass = STATUS_CLASS[user.status]

  return (
    <li className="home-user-row">
      <div className="home-user-info">
        <div className="home-user-avatar-wrapper">
          <div className="home-user-avatar" style={{ background: avatarColor }}>
            {initial}
          </div>
          <span className={`home-user-status-dot ${statusClass}`} />
        </div>
        <div className="home-user-details">
          <span className="home-user-name">{user.username}</span>
          <span className={`home-user-status-text ${statusClass}`}>
            {STATUS_TEXT[user.status]}
          </span>
        </div>
      </div>
      
      {canCall && (
        <button 
          className="home-call-btn" 
          onClick={() => startCall(user.username)} 
          disabled={callActive} 
          type="button"
        >
          <Phone size={18} />
          Gọi
        </button>
      )}
    </li>
  )
}
