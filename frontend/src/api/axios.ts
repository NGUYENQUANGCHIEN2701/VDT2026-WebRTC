import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../store/authStore'

// Base HTTP client. baseURL đọc từ .env (VITE_API_URL).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true
})


api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let isRefreshing = false
let failedQueue: { resolve: (token: string) => void, reject: (error: unknown) => void }[] = []

const processQueue = (error: unknown, token: string | null) => {
  failedQueue.forEach((p) => (token ? p.resolve(token) : p.reject(error)))
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {

    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status !== 401 || !original) return Promise.reject(error)

    // chính /auth/refresh bị 401 → cookie hỏng → logout (chặn lặp vô hạn)
    if (original.url?.includes('/auth/refresh')) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // đã thử refresh 1 lần cho request này → bỏ cuộc
    if (original._retry) return Promise.reject(error)
    original._retry = true

    // đang có refresh khác chạy → XẾP HÀNG đợi token mới rồi retry
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          },
          reject,
        })
      })
    }

    // mình là request đầu tiên bị 401 → đứng ra refresh cho cả nhóm
    isRefreshing = true
    try {
      const res = await api.post('/api/auth/refresh')
      const newToken = res.data.token as string
      useAuthStore.getState().setToken(newToken)
      processQueue(null, newToken)                       // đánh thức hàng đợi
      original.headers.Authorization = `Bearer ${newToken}`
      return api(original)                               // retry request gốc
    } catch (refreshError) {
      processQueue(refreshError, null)                   // báo lỗi cho cả hàng đợi
      useAuthStore.getState().logout()
      window.location.href = '/login'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
