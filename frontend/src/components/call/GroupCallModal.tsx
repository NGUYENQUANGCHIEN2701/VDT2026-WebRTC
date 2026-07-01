import { Search, Users, X } from "lucide-react"
import { useRef, useState } from "react"
import { startGroupInvite } from "../../realtime/roomActions"
import type { OnlineUser } from "../../realtime/messages"

function getAvatarColor(username: string) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e']
  const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[index % colors.length]
}

interface Props {
  users: OnlineUser[]
  onClose: () => void
}

export default function GroupCallModal({ users, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  const normalized = searchQuery.trim().toLowerCase()
  const filtered = normalized
    ? users.filter(u => u.username.toLowerCase().includes(normalized))
    : users

  const toggle = (username: string) => {
    setSelected(prev => {
      if (prev.includes(username)) return prev.filter(u => u !== username)
      // limit to 5
      if (prev.length >= 5) return prev
      return [...prev, username]
    })
  }

  const handleCall = () => {
    if (selected.length < 1) return
    startGroupInvite(selected)
    onClose()
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 999, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          pointerEvents: 'all',
          background: '#fff',
          borderRadius: 20,
          width: '100%',
          maxWidth: 520,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#16a34a', width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <Users size={22} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Gọi nhóm</h2>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Chọn tối đa 5 người tham gia</p>
                </div>
              </div>
              <button onClick={onClose} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 8 }}>
                <X size={22} />
              </button>
            </div>

            {/* Search */}
            <div className="home-search-wrapper" style={{ maxWidth: '100%' }}>
              <Search size={15} className="home-search-icon" />
              <input
                ref={searchRef}
                type="text"
                className="home-search-input"
                placeholder="Tìm người dùng..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoComplete="off"
              />
              {searchQuery && (
                <button className="home-search-clear" onClick={() => setSearchQuery("")} type="button">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Selected tags */}
          {selected.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 24px 0' }}>
              {selected.map(u => (
                <span key={u} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: '#eff6ff', color: '#1d4ed8', borderRadius: 999,
                  padding: '4px 10px', fontSize: 13, fontWeight: 500,
                }}>
                  {u}
                  <button onClick={() => toggle(u)} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#1d4ed8', display: 'flex' }}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* User list */}
          <ul style={{ flex: 1, overflowY: 'auto', margin: 0, padding: '8px 0', listStyle: 'none' }}>
            {filtered.length === 0 ? (
              <li style={{ padding: '32px 24px', textAlign: 'center', color: '#94a3b8' }}>
                Không tìm thấy người dùng
              </li>
            ) : filtered.map(u => {
              const isSelected = selected.includes(u.username)
              const avatarColor = getAvatarColor(u.username)
              const isOffline = u.status === 'OFFLINE'
              const statusColor = u.status === 'ONLINE' ? '#16a34a' : u.status === 'IN_CALL' ? '#d97706' : '#94a3b8'
              const statusLabel = u.status === 'ONLINE' ? 'Trực tuyến' : u.status === 'IN_CALL' ? 'Đang bận' : 'Ngoại tuyến'
              const dotClass = u.status === 'ONLINE' ? 'online' : u.status === 'IN_CALL' ? 'busy' : 'offline'
              return (
                <li key={u.username}>
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 24px',
                      cursor: isOffline ? 'default' : 'pointer',
                      opacity: isOffline ? 0.45 : 1,
                      background: isSelected ? '#eff6ff' : 'transparent',
                      transition: 'background 0.12s',
                      userSelect: 'none',
                    }}
                    onMouseEnter={e => { if (!isOffline && !isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? '#eff6ff' : 'transparent' }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => !isOffline && toggle(u.username)}
                      disabled={isOffline}
                      style={{
                        width: 18, height: 18, flexShrink: 0,
                        accentColor: 'var(--accent)',
                        cursor: isOffline ? 'not-allowed' : 'pointer',
                      }}
                    />
                    <div className="home-user-avatar-wrapper" style={{ position: 'relative', flexShrink: 0 }}>
                      <div className="home-user-avatar" style={{ background: avatarColor, width: 40, height: 40, fontSize: 16 }}>
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <span className={`home-user-status-dot ${dotClass}`} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{u.username}</div>
                      <div style={{ fontSize: 12, color: statusColor }}>{statusLabel}</div>
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>


          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              Đã chọn <strong>{selected.length}</strong> / 5 người
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} type="button" style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#475569' }}>
                Hủy
              </button>
              <button
                onClick={handleCall}
                type="button"
                disabled={selected.length < 1}
                style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none',
                  background: selected.length >= 1 ? '#16a34a' : '#e2e8f0',
                  color: selected.length >= 1 ? '#fff' : '#94a3b8',
                  cursor: selected.length >= 1 ? 'pointer' : 'not-allowed',
                  fontSize: 14, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.2s',
                }}
              >
                <Users size={16} />
                Bắt đầu gọi nhóm
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
