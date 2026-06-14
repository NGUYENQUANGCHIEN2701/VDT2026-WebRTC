import { create } from 'zustand'

interface User {
  username: string
  role: string
}

interface AuthState {
  token: string | null
  user: User | null
  isLoading: boolean
  setAuth: (token: string, user: User) => void
  setToken: (token: string) => void
  setLoading: (isLoading: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: true,

  setAuth: (token, user) => {
    set({ token, user })
  },

  setToken: (token) => {
    set({ token })
  },
  setLoading: (isLoading) => {
    set({ isLoading })
  },
  logout: () => {
    set({ token: null, user: null })
  }
})) 
