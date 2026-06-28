import api from './axios'

export interface AdminUser {
    id: number
    username: string
    email: string
    role: string
    locked: boolean
}

export async function fetchUsers(): Promise<AdminUser[]> {
    const { data } = await api.get<AdminUser[]>('/api/admin/users')
    return data
}

export const lockUser = (id: number) => api.patch(`/api/admin/users/${id}/lock`)
export const unlockUser = (id: number) => api.patch(`/api/admin/users/${id}/unlock`)
export const changeRole = (id: number, role: string) => api.patch(`/api/admin/users/${id}/role`, { role })
