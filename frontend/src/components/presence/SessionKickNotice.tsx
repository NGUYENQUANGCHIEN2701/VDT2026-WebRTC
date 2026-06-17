import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function SessionKickNotice() {
    const navigate = useNavigate()

    const goLogin = () => {
        useAuthStore.getState().logout() // xóa token in-memory
        navigate('/login', { replace: true })
    }

    useEffect(() => {
        const t = setTimeout(goLogin, 2000) // tự chuyển sau ~2s
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div role="alert" style={{ padding: 24 }}>
            <div
                style={{
                    maxWidth: 400,
                    margin: '48px auto',
                    padding: 24,
                    textAlign: 'center',
                    background: 'var(--social-bg)',
                    boxShadow: 'var(--shadow)',
                    borderRadius: 8,
                }}
            >
                <h2>Phiên đăng nhập đã kết thúc</h2>
                <p style={{ margin: '12px 0' }}>Bạn đã đăng nhập ở nơi khác. Phiên này sẽ được đăng xuất.</p>
                <p style={{ fontSize: 14, color: 'var(--text)' }}>Đang chuyển về trang đăng nhập...</p>
                <button onClick={goLogin} style={{ marginTop: 16 }}>
                    Đăng nhập lại
                </button>
            </div>
        </div>
    )
}
