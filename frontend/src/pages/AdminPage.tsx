import { useEffect, useState, useMemo } from "react"
import { Users, Activity, Clock, ChevronLeft, ChevronRight } from "lucide-react"
import { fetchUsers, lockUser, unlockUser, changeRole, type AdminUser } from "../api/admin"
import { useAuthStore } from "../store/authStore"
import ConfirmModal from "../components/admin/ConfirmModal"
import DashboardCards from "../components/admin/DashboardCards"
import SystemHistoryTable from "../components/admin/SystemHistoryTable"
import AppChrome from "../components/AppChrome"
import AdminKPIs from "../components/admin/AdminKPIs"
import AdminFilterBar from "../components/admin/AdminFilterBar"
import AdminUserTable from "../components/admin/AdminUserTable"

type Pending =
  | { kind: 'lock'; user: AdminUser }
  | { kind: 'unlock'; user: AdminUser }
  | { kind: 'role'; user: AdminUser; newRole: string }

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Pending | null>(null)
  const [activeTab, setActiveTab] = useState<'users' | 'dashboard' | 'history'>('users')
  const me = useAuthStore((s) => s.user?.username)

  // Filter states
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const reload = () => {
    setLoading(true)
    fetchUsers()
      .then(setUsers)
      .catch(() => setError('Không thể tải danh sách người dùng'))
      .finally(() => setLoading(false))
  }
  // Effect chỉ subscribe/kích hoạt fetch lần đầu; setState đồng bộ (setLoading)
  // được đẩy vào microtask kế tiếp (Promise.resolve().then) để tuân thủ quy tắc
  // react-hooks/set-state-in-effect (tránh cascading render ngay trong effect body).
  useEffect(() => { void Promise.resolve().then(reload) }, [])

  const runPending = async () => {
    if (!pending) return
    try {
      if (pending.kind === 'lock') await lockUser(pending.user.id)
      else if (pending.kind === 'unlock') await unlockUser(pending.user.id)
      else await changeRole(pending.user.id, pending.newRole)
      reload()
    } catch {
      setError('Thao tác thất bại. Thử lại.')
    } finally {
      setPending(null)
    }
  }

  const modalText = () => {
    if (!pending) return { title: '', message: '', destructive: false }
    const u = pending.user.username
    if (pending.kind === 'lock') return { title: 'Khóa người dùng', message: `Khóa "${u}"? Người dùng sẽ bị ngắt kết nối ngay.`, destructive: true }
    if (pending.kind === 'unlock') return { title: 'Mở khóa người dùng', message: `Mở khóa "${u}"?`, destructive: false }
    return { title: 'Đổi vai trò', message: `Đổi vai trò của "${u}" thành ${pending.newRole}?`, destructive: true }
  }

  // Filter users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          user.email.toLowerCase().includes(searchTerm.toLowerCase())
      const matchRole = roleFilter === 'ALL' || user.role === roleFilter
      const matchStatus = statusFilter === 'ALL' || 
                          (statusFilter === 'LOCKED' ? user.locked : !user.locked)
      
      return matchSearch && matchRole && matchStatus
    })
  }, [users, searchTerm, roleFilter, statusFilter])

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1
  // Ghi nhớ bộ lọc lúc render trước để phát hiện thay đổi ngay trong render
  // (thay vì dùng effect + setState), theo khuyến nghị "Adjusting state
  // based on props" của React — tránh setState đồng bộ trong effect.
  const filterKey = `${searchTerm}|${roleFilter}|${statusFilter}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  let effectiveCurrentPage = currentPage
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setCurrentPage(1)
    effectiveCurrentPage = 1
  }
  const paginatedUsers = useMemo(() => {
    const start = (effectiveCurrentPage - 1) * itemsPerPage
    return filteredUsers.slice(start, start + itemsPerPage)
  }, [filteredUsers, effectiveCurrentPage, itemsPerPage])

  const kpis = useMemo(() => ({
    total: users.length,
    active: users.filter(u => !u.locked).length,
    locked: users.filter(u => u.locked).length,
    adminCount: users.filter(u => u.role === 'ADMIN').length
  }), [users])

  return (
    <AppChrome>
      <div className="admin-page" style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <div className="admin-header">
          <h1>Quản trị — Danh sách người dùng</h1>
          <p>Quản lý và theo dõi toàn bộ tài khoản hệ thống</p>
        </div>

        <nav className="admin-tabs">
          <button className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            <Users size={18} /> Người dùng
          </button>
          <button className={`admin-tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <Activity size={18} /> Bảng điều khiển
          </button>
          <button className={`admin-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <Clock size={18} /> Lịch sử hệ thống
          </button>
        </nav>

        {activeTab === 'dashboard' && <DashboardCards />}
        {activeTab === 'history' && <SystemHistoryTable />}

        {activeTab === 'users' && (
          <>
            <AdminKPIs {...kpis} />

            <div className="admin-table-container">
              <AdminFilterBar 
                searchTerm={searchTerm} setSearchTerm={setSearchTerm}
                roleFilter={roleFilter} setRoleFilter={setRoleFilter}
                statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                onRefresh={reload}
              />

              {loading && <div style={{ padding: 40, textAlign: 'center' }}>Đang tải…</div>}
              {error && <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>{error}</div>}

              {!loading && !error && (
                <>
                  <AdminUserTable 
                    users={paginatedUsers} 
                    me={me} 
                    onToggleLock={(u) => setPending({ kind: u.locked ? 'unlock' : 'lock', user: u })}
                    onChangeRole={(u, newRole) => setPending({ kind: 'role', user: u, newRole })}
                  />

                  {filteredUsers.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text)' }}>Không tìm thấy người dùng nào.</div>
                  ) : (
                    <div className="admin-pagination">
                      <span className="pagination-info">
                        Hiển thị {((effectiveCurrentPage - 1) * itemsPerPage) + 1} đến {Math.min(effectiveCurrentPage * itemsPerPage, filteredUsers.length)} của {filteredUsers.length} người dùng
                      </span>
                      <div className="pagination-controls">
                        <button
                          className="page-btn"
                          disabled={effectiveCurrentPage === 1}
                          onClick={() => setCurrentPage(p => p - 1)}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button className="page-btn active">{effectiveCurrentPage}</button>
                        <button
                          className="page-btn"
                          disabled={effectiveCurrentPage === totalPages}
                          onClick={() => setCurrentPage(p => p + 1)}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {pending && (
          <ConfirmModal {...modalText()} onConfirm={runPending} onCancel={() => setPending(null)} />
        )}
      </div>
    </AppChrome>
  )
}
