import { Search, Users, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import GroupCallModal from "../call/GroupCallModal"
import { useAuthStore } from "../../store/authStore"
import { useCallStore } from "../../store/callStore"
import { usePresenceStore } from "../../store/presenceStore"
import { useRoomStore } from "../../store/roomStore"
import type { OnlineUser } from "../../realtime/messages"
import OnlineUserRow from "./OnlineUserRow"

export default function OnlineUsersList() {
  const onlineUsers = usePresenceStore((s) => s.onlineUsers)
  const connectionState = usePresenceStore((s) => s.connectionState)
  const me = useAuthStore((s) => s.user?.username)
  const token = useAuthStore((s) => s.token)
  const callActive = useCallStore((s) => s.callState) !== "idle"
  const roomBusy = useRoomStore((s) => s.roomId != null || s.outgoingInvitees.length > 0)

  const [allUsers, setAllUsers] = useState<string[]>([])
  const [filter, setFilter] = useState<'all' | 'online' | 'busy' | 'offline'>('all')
  const [searchQuery, setSearchQuery] = useState("")
  const [showGroupModal, setShowGroupModal] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const canStartGroup = !callActive && !roomBusy

  // Fetch all registered standard users
  useEffect(() => {
    if (!token) return
    fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((data: Array<{ username: string }>) => {
        setAllUsers(data.map(u => u.username))
      })
      .catch(() => {/* silent */ })
  }, [token])

  // Merge: all users + real-time presence
  const presenceMap = new Map(onlineUsers.map(u => [u.username, u.status]))

  const mergedUsers: OnlineUser[] = allUsers
    .filter(u => u !== me)
    .map(u => ({
      username: u,
      status: presenceMap.get(u) ?? 'OFFLINE',
    }))

  const normalizedQuery = searchQuery.trim().toLowerCase()

  let filteredUsers = normalizedQuery
    ? mergedUsers.filter(u => u.username.toLowerCase().includes(normalizedQuery))
    : mergedUsers

  if (filter === 'online') filteredUsers = filteredUsers.filter(u => u.status === 'ONLINE')
  if (filter === 'busy') filteredUsers = filteredUsers.filter(u => u.status === 'IN_CALL')
  if (filter === 'offline') filteredUsers = filteredUsers.filter(u => u.status === 'OFFLINE')

  const clearSearch = () => {
    setSearchQuery("")
    searchInputRef.current?.focus()
  }

  if (connectionState === "connecting") {
    return (
      <div className="app-panel">
        <div className="app-panel-header">
          <h2>Danh sách người dùng</h2>
        </div>
        <div style={{ padding: 24, color: 'var(--text)' }}>Đang kết nối...</div>
      </div>
    )
  }

  const dim = connectionState === "closed"

  return (
    <>
      {/* Group Call Card */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#f0fdf4', border: '1px solid #bbf7d0',
        borderRadius: 16, padding: '20px 24px', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ background: '#22c55e', width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
            <Users size={28} />
          </div>
          <div>
            <h2 style={{ fontSize: 18, margin: '0 0 4px', color: '#0f172a', fontWeight: 700 }}>Gọi nhóm</h2>
            <p style={{ margin: 0, color: '#475569', fontSize: 14 }}>Tạo cuộc gọi nhóm và trò chuyện với nhiều người cùng lúc.</p>
          </div>
        </div>
        <button
          className="app-button"
          onClick={() => setShowGroupModal(true)}
          disabled={!canStartGroup}
          style={{ borderRadius: 10, backgroundColor: '#16a34a', borderColor: '#16a34a', padding: '11px 22px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
        >
          <Users size={17} />
          Gọi nhóm ngay
        </button>
      </div>

      {/* User list panel */}
      <div className="app-panel" style={{ opacity: dim ? 0.7 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 17, margin: 0, fontWeight: 700, color: 'var(--text-h)' }}>
            Danh sách người dùng
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, color: '#64748b', background: '#f1f5f9', borderRadius: 99, padding: '2px 10px' }}>{mergedUsers.length}</span>
          </h2>

          <div className="home-search-wrapper" style={{ maxWidth: 220 }}>
            <Search size={15} className="home-search-icon" />
            <input
              ref={searchInputRef}
              id="online-users-search"
              type="text"
              className="home-search-input"
              placeholder="Tìm người dùng..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoComplete="off"
              aria-label="Tìm kiếm người dùng"
            />
            {searchQuery && (
              <button className="home-search-clear" onClick={clearSearch} type="button">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 24px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {[
            { key: 'all' as const, label: 'Tất cả', dotClass: '' },
            { key: 'online' as const, label: 'Trực tuyến', dotClass: 'status-dot-online' },
            { key: 'busy' as const, label: 'Đang bận', dotClass: 'status-dot-busy' },
            { key: 'offline' as const, label: 'Ngoại tuyến', dotClass: 'status-dot-offline' },
          ].map(({ key, label, dotClass }) => (
            <button
              key={key}
              className={`filter-chip ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
              type="button"
            >
              {dotClass
                ? <span className={`status-dot ${dotClass}`} style={{ marginRight: 6 }} />
                : <Users size={14} style={{ marginRight: 6 }} />
              }
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        {mergedUsers.length === 0 ? (
          <div className="home-empty-state">
            <div className="home-empty-icon">👥</div>
            <p className="home-empty-title">Chưa có người dùng nào</p>
            <p className="home-empty-desc">Danh sách sẽ hiển thị khi có người dùng trong hệ thống.</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="home-empty-state">
            <div className="home-empty-icon">🔍</div>
            <p className="home-empty-title">Không tìm thấy kết quả</p>
            <p className="home-empty-desc">Không có người dùng nào khớp với bộ lọc hiện tại.</p>
          </div>
        ) : (
          <ul className="home-user-list">
            {filteredUsers.map(u => (
              <OnlineUserRow key={u.username} user={u} searchQuery={normalizedQuery} />
            ))}
          </ul>
        )}
      </div>

      {/* Group Call Modal */}
      {showGroupModal && (
        <GroupCallModal
          users={mergedUsers}
          onClose={() => setShowGroupModal(false)}
        />
      )}
    </>
  )
}
