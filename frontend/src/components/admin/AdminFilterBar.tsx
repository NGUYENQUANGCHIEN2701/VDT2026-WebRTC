import { Search, RefreshCw } from "lucide-react"

interface Props {
  searchTerm: string
  setSearchTerm: (v: string) => void
  roleFilter: string
  setRoleFilter: (v: string) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
  onRefresh: () => void
}

export default function AdminFilterBar({
  searchTerm, setSearchTerm,
  roleFilter, setRoleFilter,
  statusFilter, setStatusFilter,
  onRefresh
}: Props) {
  return (
    <div className="admin-filters">
      <div className="admin-search">
        <Search size={16} />
        <input 
          type="text" 
          placeholder="Tìm kiếm theo username, email..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      <select 
        className="admin-select" 
        value={roleFilter} 
        onChange={(e) => setRoleFilter(e.target.value)}
      >
        <option value="ALL">Tất cả vai trò</option>
        <option value="ADMIN">Quản trị viên (ADMIN)</option>
        <option value="USER">Người dùng (USER)</option>
      </select>

      <select 
        className="admin-select" 
        value={statusFilter} 
        onChange={(e) => setStatusFilter(e.target.value)}
      >
        <option value="ALL">Tất cả trạng thái</option>
        <option value="ACTIVE">Đang hoạt động</option>
        <option value="LOCKED">Đã khóa</option>
      </select>

      <div style={{ flex: 1 }} />

      <button className="action-btn" onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <RefreshCw size={14} />
        Làm mới
      </button>
    </div>
  )
}
