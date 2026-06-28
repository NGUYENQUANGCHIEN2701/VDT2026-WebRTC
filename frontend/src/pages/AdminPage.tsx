import { useEffect, useState } from "react"
import { fetchUsers, lockUser, unlockUser, changeRole, type AdminUser } from "../api/admin"
import { useAuthStore } from "../store/authStore"
import ConfirmModal from "../components/admin/ConfirmModal"
import DashboardCards from "../components/admin/DashboardCards"
import SystemHistoryTable from "../components/admin/SystemHistoryTable"

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

    const reload = () => {
        setLoading(true)
        fetchUsers().then(setUsers).catch(() => setError('Không thể tải danh sách người dùng')).finally(() => setLoading(false))
    }
    useEffect(() => { reload() }, [])

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

    return (
        <div style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'sans-serif' }}>
            <h1>Quản trị — Danh sách người dùng</h1>

            <nav style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
                {([['users', 'Người dùng'], ['dashboard', 'Bảng điều khiển'], ['history', 'Lịch sử hệ thống']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                        style={{
                            background: 'transparent', border: 'none',
                            borderBottom: activeTab === key ? '2px solid var(--accent)' : '2px solid transparent',
                            fontSize: 16, fontWeight: activeTab === key ? 600 : 400, padding: '8px 16px', cursor: 'pointer',
                        }}>
                        {label}
                    </button>
                ))}
            </nav>

            {activeTab === 'dashboard' && <DashboardCards />}
            {activeTab === 'history' && <SystemHistoryTable />}

            {activeTab === 'users' && (
                <>
            {loading && <p>Đang tải…</p>}
            {error && <p style={{ color: '#dc2626' }}>{error}</p>}

            {!loading && !error && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                            <th style={th}>ID</th><th style={th}>Username</th><th style={th}>Email</th>
                            <th style={th}>Role</th><th style={th}>Trạng thái</th><th style={th}>Hành động</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => {
                            const isSelf = user.username === me
                            return (
                                <tr key={user.id}>
                                    <td style={td}>{user.id}</td>
                                    <td style={td}>{user.username}</td>
                                    <td style={td}>{user.email}</td>
                                    <td style={td}>
                                        <select value={user.role} disabled={isSelf}
                                            onChange={(e) => setPending({ kind: 'role', user, newRole: e.target.value })}
                                            style={{ padding: 4, opacity: isSelf ? 0.4 : 1, cursor: isSelf ? 'not-allowed' : 'pointer' }}>
                                            <option value="USER">USER</option>
                                            <option value="ADMIN">ADMIN</option>
                                        </select>
                                    </td>
                                    <td style={td}>{user.locked ? 'Đã khóa' : 'Hoạt động'}</td>
                                    <td style={td}>
                                        {isSelf ? <span style={{ opacity: 0.4 }}>—</span> : (
                                            user.locked
                                                ? <button onClick={() => setPending({ kind: 'unlock', user })} style={btn}>Mở khóa</button>
                                                : <button onClick={() => setPending({ kind: 'lock', user })} style={{ ...btn, color: '#dc2626', borderColor: '#dc2626' }}>Khóa</button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            )}

            {!loading && !error && users.length === 0 && <p>Chưa có người dùng nào.</p>}

            {pending && (
                <ConfirmModal {...modalText()} onConfirm={runPending} onCancel={() => setPending(null)} />
            )}
                </>
            )}
        </div>
    )
}

const th: React.CSSProperties = { padding: 8, borderBottom: '2px solid #d1d5db' }
const td: React.CSSProperties = { padding: 8, borderBottom: '1px solid #e5e7eb' }
const btn: React.CSSProperties = { padding: '4px 8px', fontSize: 14, fontWeight: 600, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }
