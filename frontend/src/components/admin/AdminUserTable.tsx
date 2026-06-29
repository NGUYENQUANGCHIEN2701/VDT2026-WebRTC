import { MoreHorizontal, Lock, Unlock } from "lucide-react"
import type { AdminUser } from "../../api/admin"

interface Props {
  users: AdminUser[]
  me: string | undefined
  onToggleLock: (u: AdminUser) => void
  onChangeRole: (u: AdminUser, role: string) => void
}

function getAvatarColor(username: string) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e']
  const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[index % colors.length]
}

export default function AdminUserTable({ users, me, onToggleLock, onChangeRole }: Props) {
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Username</th>
          <th>Email</th>
          <th>Role</th>
          <th>Trạng thái</th>
          <th>Hành động</th>
        </tr>
      </thead>
      <tbody>
        {users.map(user => {
          const isSelf = user.username === me
          const initial = user.username.charAt(0).toUpperCase()
          const avatarColor = getAvatarColor(user.username)

          return (
            <tr key={user.id} style={{ opacity: user.locked ? 0.7 : 1 }}>
              <td>{user.id}</td>
              
              <td>
                <div className="user-info-cell">
                  <div className="user-avatar" style={{ background: avatarColor }}>
                    {initial}
                  </div>
                  <div className="user-name-group">
                    <span className="user-name">{user.username}</span>
                  </div>
                </div>
              </td>
              
              <td>{user.email}</td>
              
              <td>
                <select 
                  className={`role-badge ${user.role === 'ADMIN' ? 'admin' : 'user'}`}
                  value={user.role} 
                  disabled={isSelf}
                  onChange={(e) => onChangeRole(user, e.target.value)}
                  style={{ opacity: isSelf ? 0.5 : 1, cursor: isSelf ? 'not-allowed' : 'pointer' }}
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </td>
              
              <td>
                <div className="status-indicator">
                  <span className={`status-dot ${user.locked ? 'locked' : 'active'}`} />
                  {user.locked ? 'Đã khóa' : 'Hoạt động'}
                </div>
              </td>
              
              <td>
                <div className="action-cell">
                  {isSelf ? (
                    <span style={{ color: 'var(--text)', padding: '6px 12px' }}>—</span>
                  ) : (
                    <>
                      <button 
                        className={`action-btn ${user.locked ? '' : 'danger'}`}
                        onClick={() => onToggleLock(user)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        {user.locked ? <Unlock size={14} /> : <Lock size={14} />}
                        {user.locked ? 'Mở khóa' : 'Khóa'}
                      </button>
                      <button className="action-btn" style={{ padding: '6px' }}>
                        <MoreHorizontal size={16} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
