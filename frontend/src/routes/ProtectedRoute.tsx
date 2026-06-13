import type { ReactNode } from 'react'

// Bọc các route cần đăng nhập.
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  // TODO (bạn code): đọc token từ useAuthStore;
  //  - chưa có token → return <Navigate to="/login" replace />
  //  - có token → render children
  return <>{children}</>
}
