import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'


export default function ProtectedRoute({ children, requiredRole }: { children: ReactNode; requiredRole?: string }) {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  
  if(!token) {
    return <Navigate to="/login" replace />
  }
  
  if(requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />
  }
  
  return <>{children}</>
}
