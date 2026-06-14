import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// Bọc các route cần đăng nhập.
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.token)
  if(!token) {
    return <Navigate to="/login" replace />
  } 
  return <>{children}</>
}
