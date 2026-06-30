import { useEffect } from "react"
import { CheckCircle2, Loader2, Users, XCircle } from "lucide-react"

interface Props {
  invitees: string[]
  joined: string[]
  declined: string[]
  onCancel: () => void
}

function getAvatarColor(username: string) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e']
  const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[index % colors.length]
}

export default function OutgoingGroupInviteCard({ invitees, joined, declined, onCancel }: Props) {
  useEffect(() => {
    // Tự động hủy màn hình mời nếu sau 32s không có ai tham gia (đã từ chối hết hoặc bơ)
    const timer = setTimeout(() => {
      onCancel()
    }, 32000)
    return () => clearTimeout(timer)
  }, [onCancel])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        maxWidth: 420, width: '90%', background: 'var(--surface-solid)',
        borderRadius: 20, padding: '32px 24px 24px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.12)', textAlign: 'center',
        position: 'relative',
      }}>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <svg style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 200, height: 160, pointerEvents: 'none' }} viewBox="0 0 200 160">
            <circle cx="65" cy="40" r="3" fill="#c4b5fd" />
            <circle cx="45" cy="80" r="4.5" fill="#38bdf8" />
            <circle cx="155" cy="35" r="3.5" fill="#a5b4fc" />
            <path d="M 165 65 Q 165 75 155 75 Q 165 75 165 85 Q 165 75 175 75 Q 165 75 165 65 Z" fill="#818cf8" />
            <path d="M 148 115 L 154 121 M 154 115 L 148 121" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
          </svg>

          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'var(--accent-bg)', color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', zIndex: 1,
          }}>
            <Users size={36} strokeWidth={2.5} />
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-h)' }}>
          Đang mời vào phòng nhóm
        </h2>
        <p style={{ fontSize: 15, margin: '0 0 24px', color: 'var(--text)', opacity: 0.8 }}>
          Mời {invitees.length} người tham gia cuộc gọi nhóm
        </p>

        <ul style={{ margin: '0 0 24px', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {invitees.map((username) => {
            const isJoined = joined.includes(username)
            const isDeclined = declined.includes(username)
            const initial = username.charAt(0).toUpperCase()
            const avatarColor = getAvatarColor(username)

            return (
              <li key={username} style={{
                display: 'flex', alignItems: 'center', padding: '10px 16px',
                listStyle: 'none', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: avatarColor, color: '#fff',
                  display: 'grid', placeItems: 'center',
                  fontWeight: 600, fontSize: 15,
                }}>
                  {initial}
                </div>

                <span style={{ marginLeft: 12, fontWeight: 600, fontSize: 15, color: 'var(--text-h)' }}>
                  {username}
                </span>

                <div style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center',
                  gap: 6, fontSize: 13,
                  color: isJoined ? '#16a34a' : isDeclined ? '#dc2626' : 'var(--text)',
                  fontWeight: 500, opacity: isJoined || isDeclined ? 1 : 0.7,
                }}>
                  {isJoined ? (
                    <>
                      <CheckCircle2 size={16} />
                      Đã tham gia
                    </>
                  ) : isDeclined ? (
                    <>
                      <XCircle size={16} />
                      Đã từ chối
                    </>
                  ) : (
                    <>
                      <Loader2 size={16} style={{ animation: 'spinner-rotate 1.5s linear infinite', color: 'var(--accent)' }} />
                      Đang chờ...
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <button
          onClick={onCancel}
          type="button"
          style={{
            width: '100%', minHeight: 46, borderRadius: 10,
            background: 'var(--surface)', border: '1px solid var(--accent-border)',
            color: 'var(--accent)', fontWeight: 600, fontSize: 15,
            cursor: 'pointer', transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'var(--accent-bg)'
            e.currentTarget.style.borderColor = 'var(--accent)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'var(--surface)'
            e.currentTarget.style.borderColor = 'var(--accent-border)'
          }}
        >
          Hủy mời
        </button>
      </div>
    </div>
  )
}
