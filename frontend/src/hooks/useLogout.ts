import { useNavigate } from "react-router-dom"
import { useAuthStore } from "../store/authStore"
import api from "../api/axios"

export function useLogout() {
    const navigate = useNavigate()
    const clearAuth = useAuthStore((s) => s.logout)

    return async () => {
        try {
            await api.post('/api/auth/logout')
        } catch {
        } finally {
            clearAuth()                                 
            navigate('/login', { replace: true })      
        }
    }
}