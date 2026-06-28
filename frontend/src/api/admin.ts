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

export interface DashboardData {
    onlineUsers: number
    activeCalls: number
    todayStarted: number
    todayCompleted: number
    todayMissed: number
}

export interface AdminHistoryRow {
    callId: string
    callerId: string
    calleeId: string
    endReason: string
    durationMs: number | null
    startedAt: string | null
    endedAt: string
}

export interface AdminHistoryPage {
    content: AdminHistoryRow[]
    totalPages: number
    number: number
}

export async function fetchDashboard(): Promise<DashboardData> {
    const { data } = await api.get<DashboardData>('/api/admin/dashboard')
    return data
}

export async function fetchAdminHistory(page = 0, size = 20, username?: string): Promise<AdminHistoryPage> {
    const { data } = await api.get<AdminHistoryPage>('/api/admin/history', {
        params: { page, size, username: username || undefined },
    })
    return data
}
