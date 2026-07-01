import { Search, UserPlus, X, Info } from "lucide-react"
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

  const onlineUsers = filtered.filter(u => u.status !== 'OFFLINE')
  const offlineUsers = filtered.filter(u => u.status === 'OFFLINE')

  const toggle = (username: string) => {
    setSelected(prev => {
      if (prev.includes(username)) return prev.filter(u => u !== username)
      if (prev.length >= 3) return prev // limit to 3
      return [...prev, username]
    })
  }

  const handleCall = () => {
    if (selected.length < 2) return
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
          background: 'var(--surface-solid)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 540,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow)',
          overflow: 'hidden',
          fontFamily: 'var(--sans)',
        }}>
          {/* Header */}
          <div style={{ padding: '24px 24px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ background: 'var(--success)', width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <UserPlus size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-h)' }}>Gọi nhóm</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: 14, color: 'var(--text)' }}>Chọn từ 2–3 người để tạo cuộc gọi nhóm (tối đa 4 người)</p>
                </div>
              </div>
              <button onClick={onClose} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: 4, borderRadius: 8, opacity: 0.7 }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}>
                <X size={24} />
              </button>
            </div>

            {/* Search */}
            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <Search size={18} style={{ position: 'absolute', left: 16, color: 'var(--text)', opacity: 0.6 }} />
              <input
                ref={searchRef}
                type="text"
                placeholder="Tìm theo tên người dùng..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 44px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 15,
                  outline: 'none',
                  color: 'var(--text-h)',
                  background: 'transparent',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")} 
                  type="button"
                  style={{
                    position: 'absolute', right: 16,
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)',
                    padding: 4, opacity: 0.7
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Info Alert */}
            <div style={{
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent-border)',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start'
            }}>
              <div style={{
                background: 'var(--accent)',
                color: '#fff',
                width: 24, height: 24,
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2
              }}>
                <Info size={16} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-h)', fontSize: 14, marginBottom: 2 }}>
                  Cuộc gọi nhóm cho phép tối đa 4 người
                </div>
                <div style={{ color: 'var(--text)', fontSize: 13 }}>
                  Bạn + 2–3 người khác
                </div>
              </div>
            </div>
          </div>

          {/* User list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px', margin: 0 }}>
            {onlineUsers.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', opacity: 0.8, marginBottom: 12, letterSpacing: 0.5 }}>TRỰC TUYẾN</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {onlineUsers.map((u, index) => {
                    const isSelected = selected.includes(u.username)
                    const avatarColor = getAvatarColor(u.username)
                    const isBusy = u.status === 'IN_CALL'
                    return (
                      <label
                        key={u.username}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 16,
                          padding: '12px 0',
                          borderBottom: index < onlineUsers.length - 1 || offlineUsers.length > 0 ? '1px solid var(--border)' : 'none',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <div style={{
                          width: 20, height: 20,
                          borderRadius: 4,
                          border: isSelected ? 'none' : '1px solid var(--border)',
                          background: isSelected ? 'var(--accent)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.1s'
                        }}>
                          {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(u.username)}
                          style={{ display: 'none' }}
                        />
                        <div className="home-user-avatar-wrapper" style={{ position: 'relative', flexShrink: 0 }}>
                          <div className="home-user-avatar" style={{ background: avatarColor, width: 40, height: 40, fontSize: 16, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <span className={`home-user-status-dot ${isBusy ? 'busy' : 'online'}`} style={{ border: '2px solid var(--surface-solid)' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)' }}>{u.username}</div>
                          <div style={{ fontSize: 13, color: isBusy ? 'var(--warning)' : 'var(--success)' }}>{isBusy ? 'Đang bận' : 'Trực tuyến'}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {offlineUsers.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', opacity: 0.8, marginBottom: 12, letterSpacing: 0.5 }}>NGOẠI TUYẾN</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {offlineUsers.map((u, index) => {
                    const avatarColor = getAvatarColor(u.username)
                    return (
                      <div
                        key={u.username}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 16,
                          padding: '12px 0',
                          borderBottom: index < offlineUsers.length - 1 ? '1px solid var(--border)' : 'none',
                          opacity: 0.5,
                          userSelect: 'none',
                        }}
                      >
                        <div style={{
                          width: 20, height: 20,
                          borderRadius: 4,
                          border: '1px solid var(--border)',
                          background: 'var(--surface-soft)',
                        }} />
                        <div className="home-user-avatar-wrapper" style={{ position: 'relative', flexShrink: 0 }}>
                          <div className="home-user-avatar" style={{ background: avatarColor, width: 40, height: 40, fontSize: 16, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <span className="home-user-status-dot offline" style={{ border: '2px solid var(--surface-solid)', background: 'var(--text)' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)' }}>{u.username}</div>
                          <div style={{ fontSize: 13, color: 'var(--text)' }}>Ngoại tuyến</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            {filtered.length === 0 && (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text)', opacity: 0.8 }}>
                Không tìm thấy người dùng
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-solid)', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14, color: 'var(--text)' }}>
                Đã chọn <strong style={{ color: 'var(--text-h)' }}>{selected.length}</strong> / 3 người
              </span>
              <span style={{ fontSize: 13, color: 'var(--text)', opacity: 0.8 }}>
                Cần chọn từ 2 đến 3 người
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                onClick={onClose} 
                type="button" 
                style={{ 
                  padding: '10px 20px', 
                  borderRadius: 8, 
                  border: '1px solid var(--border)', 
                  background: 'var(--surface-solid)', 
                  cursor: 'pointer', 
                  fontSize: 14, 
                  fontWeight: 600, 
                  color: 'var(--text-h)',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-soft)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-solid)'}
              >
                Hủy
              </button>
              <button
                onClick={handleCall}
                type="button"
                disabled={selected.length < 2}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: selected.length >= 2 ? 'var(--accent)' : 'var(--border)',
                  color: selected.length >= 2 ? '#fff' : 'var(--text)',
                  cursor: selected.length >= 2 ? 'pointer' : 'not-allowed',
                  fontSize: 14, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.2s',
                  opacity: selected.length >= 2 ? 1 : 0.6
                }}
                onMouseEnter={e => { if (selected.length >= 2) e.currentTarget.style.background = 'var(--accent-strong)' }}
                onMouseLeave={e => { if (selected.length >= 2) e.currentTarget.style.background = 'var(--accent)' }}
              >
                <UserPlus size={18} />
                Bắt đầu gọi nhóm
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
