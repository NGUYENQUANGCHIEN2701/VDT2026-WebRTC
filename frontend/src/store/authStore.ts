import { create } from 'zustand'

// State đăng nhập dùng chung toàn app.
interface AuthState {
  token: string | null
  // TODO (bạn code): user info (username, role), setAuth(), logout()
}

export const useAuthStore = create<AuthState>(() => ({
  token: null,
  // TODO: khởi tạo token từ localStorage; thêm action setAuth/logout
}))
