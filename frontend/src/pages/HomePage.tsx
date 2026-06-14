import { useLogout } from "../hooks/useLogout"
import { useAuthStore } from "../store/authStore"


export default function HomePage() {
    const user = useAuthStore((state) => state.user)
    const logout = useLogout()


    return (
        <div style={{ padding: 24 }}>
            <h1>Xin chào, {user?.username}</h1>
            <p>Role: {user?.role}</p>
            <button onClick={logout}>Đăng xuất</button>
        </div>
    )
}