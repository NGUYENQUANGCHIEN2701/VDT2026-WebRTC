import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// Base HTTP client. baseURL đọc từ .env (VITE_API_URL).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
  headers: { 'Content-Type': 'application/json' },
})


// Interceptor để tự động thêm token vào header Authorization của tất cả các request nếu token tồn tại trong authStore.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor để tự động xử lý lỗi 401 Unauthorized. Nếu token hết hạn hoặc không hợp lệ, sẽ tự động logout và chuyển hướng về trang login.
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  })

export default api
