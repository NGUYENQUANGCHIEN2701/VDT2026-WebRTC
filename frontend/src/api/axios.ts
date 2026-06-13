import axios from 'axios'

// Base HTTP client. baseURL đọc từ .env (VITE_API_URL).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
  headers: { 'Content-Type': 'application/json' },
})

// TODO (bạn code):
//  - request interceptor: đính header "Authorization: Bearer <token>" lấy từ authStore
//  - response interceptor: gặp 401 → xóa token + chuyển hướng /login

export default api
