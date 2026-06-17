import { useNavigate } from "react-router-dom"
import { useAuthStore } from "../store/authStore"
import api from "../api/axios"
import { disconnectWs } from "../realtime/wsClient"

export function useLogout() {
    const navigate = useNavigate()
    const clearAuth = useAuthStore((s) => s.logout)

    return async () => {
        try {
            await api.post('/api/auth/logout')
        } catch {
            // Cố ý bỏ qua: logout phía client phải luôn thành công dù API lỗi mạng.
            // Cookie/token sẽ được dọn ở finally bất kể server có phản hồi hay không.
        } finally {
            disconnectWs()   // đóng WS sạch → BE thấy ngay, không reconnect
            clearAuth()
            navigate('/login', { replace: true })
        }
    }
}