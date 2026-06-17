import type { OnlineUser } from "../realtime/messages"
import { create } from 'zustand'

export type ConnectionState = 'connecting' | 'open' | 'closed'

interface PresenceState {
    onlineUsers: OnlineUser[]
    connectionState: ConnectionState
    kicked: boolean
    setOnline: (users: OnlineUser[]) => void
    setConnState: (state: ConnectionState) => void
    setKicked: (kicked: boolean) => void
}

export const usePresenceStore = create<PresenceState>((set) => ({
    onlineUsers: [],
    connectionState: 'connecting',
    kicked: false,

    setOnline: (users) => {
        set({ onlineUsers: users })
    },
    setConnState: (connectionState) => set({ connectionState }),
    setKicked: (kicked) => set({ kicked }),
}))