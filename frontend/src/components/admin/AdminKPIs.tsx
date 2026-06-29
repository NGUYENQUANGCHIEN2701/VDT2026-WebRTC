import { Users, Activity, Lock, Shield } from "lucide-react"

interface Props {
  total: number
  active: number
  locked: number
  adminCount: number
}

export default function AdminKPIs({ total, active, locked, adminCount }: Props) {
  return (
    <div className="admin-kpis">
      <div className="kpi-card">
        <div className="kpi-icon blue"><Users size={28} /></div>
        <div className="kpi-content">
          <span className="kpi-title">Tổng người dùng</span>
          <span className="kpi-value">{total}</span>
          <span className="kpi-sub">Tất cả tài khoản</span>
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-icon green"><Activity size={28} /></div>
        <div className="kpi-content">
          <span className="kpi-title">Đang hoạt động</span>
          <span className="kpi-value">{active}</span>
          <span className="kpi-sub">Tài khoản</span>
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-icon orange"><Lock size={28} /></div>
        <div className="kpi-content">
          <span className="kpi-title">Đã khóa</span>
          <span className="kpi-value">{locked}</span>
          <span className="kpi-sub">Tài khoản</span>
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-icon purple"><Shield size={28} /></div>
        <div className="kpi-content">
          <span className="kpi-title">Quản trị viên</span>
          <span className="kpi-value">{adminCount}</span>
          <span className="kpi-sub">Tài khoản</span>
        </div>
      </div>
    </div>
  )
}
