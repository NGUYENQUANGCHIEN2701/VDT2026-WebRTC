import { useEffect, useState } from "react"
import api from "../api/axios"

interface UserRow {
    id: number
    username: string
    email: string
    role: string
    locked: boolean
}

export default function AdminPage() {
    const [users, setUsers] = useState<UserRow[]>([])
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.get('/api/admin/users')
            .then(res => setUsers(res.data))
            .catch(() => setError('Không thể tải danh sách người dùng'))
            .finally(() => setLoading(false))
    }, [])

    return (
        <div style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'sans-serif' }}>
            <h1>Quản trị — Danh sách người dùng</h1>

            {loading && <p>Đang tải…</p>}
            {error && <p style={{ color: 'red' }}>{error}</p>}

            {!loading && !error && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                            <th style={th}>ID</th>
                            <th style={th}>Username</th>
                            <th style={th}>Email</th>
                            <th style={th}>Role</th>
                            <th style={th}>Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id}>
                                <td style={td}>{user.id}</td>
                                <td style={td}>{user.username}</td>
                                <td style={td}>{user.email}</td>
                                <td style={td}>{user.role}</td>
                                <td style={td}>{user.locked ? 'Đã khóa' : 'Hoạt động'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {!loading && !error && users.length === 0 && <p>Chưa có người dùng nào.</p>}
        </div>
    )
}

const th: React.CSSProperties = { padding: 8, borderBottom: '2px solid #d1d5db' }
const td: React.CSSProperties = { padding: 8, borderBottom: '1px solid #e5e7eb' }
