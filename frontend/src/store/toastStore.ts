import { create } from 'zustand'

export type ToastVariant = 'info' | 'warning'
export interface Toast {
    id: number
    message: string
    variant: ToastVariant
}

interface ToastState {
    toasts: Toast[]
    show: (message: string, variant?: ToastVariant) => void
    dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    show: (message, variant = 'info') => {
        const id = nextId++
        set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }))
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000) // tự ẩn sau 4s
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
