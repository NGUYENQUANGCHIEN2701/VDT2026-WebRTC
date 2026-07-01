import { MoreVertical, Phone } from "lucide-react"
import { startCall } from "../../realtime/callActions"
import { useCallStore } from "../../store/callStore"
import type { OnlineUser, PresenceStatus } from "../../realtime/messages"

function getAvatarColor(username: string) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e']
  const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[index % colors.length]
}

const STATUS_TEXT: Record<PresenceStatus, string> = {
  ONLINE: "Trực tuyến",
  IN_CALL: "Đang bận",
  OFFLINE: "Ngoại tuyến",
}

const STATUS_CLASS: Record<PresenceStatus, string> = {
  ONLINE: "online",
  IN_CALL: "busy",
  OFFLINE: "offline",
}

interface Props {
  user: OnlineUser
  searchQuery?: string
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark style={{ background: 'rgba(59,130,246,0.25)', color: 'inherit', borderRadius: 3, padding: '0 1px' }}>
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  )
}

export default function OnlineUserRow({ user, searchQuery = "" }: Props) {
  const callActive = useCallStore((s) => s.callState) !== "idle"
  const initial = user.username.charAt(0).toUpperCase()
  const avatarColor = getAvatarColor(user.username)
  const statusClass = STATUS_CLASS[user.status]
  const canCall = user.status === 'ONLINE' && !callActive

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
          <span className="home-user-name">
            <HighlightedText text={user.username} query={searchQuery} />
          </span>
          <span className={`home-user-status-text ${statusClass}`}>
            {STATUS_TEXT[user.status]}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {user.status !== 'OFFLINE' && (
          <button
            className="home-call-btn"
            onClick={() => { if (canCall) startCall(user.username) }}
            type="button"
            disabled={!canCall}
          >
            <Phone size={16} />
            Gọi
          </button>
        )}
        <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 4 }}>
          <MoreVertical size={20} />
        </button>
      </div>
    </li>
  )
}
