import { create } from 'zustand'

export type PeerConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'idle'

export interface RoomMember {
    username: string
    connectionState: PeerConnectionState
    micMuted: boolean
    camOff: boolean
    streamVersion: number
}

export interface RoomInviteState {
    roomId: string
    from: string
    invitees: string[]
}

interface RoomStoreState {
    roomId: string | null
    selfId: string | null
    members: Record<string, RoomMember>
    incomingInvite: RoomInviteState | null
    outgoingInvitees: string[]
    micMuted: boolean
    camOff: boolean
    connectedAt: number | null
    activeMaxBitrate: number | null
    setIncomingInvite: (invite: RoomInviteState | null) => void
    setOutgoingInvitees: (invitees: string[]) => void
    initRoom: (roomId: string, selfId: string, members: string[]) => void
    addMember: (username: string) => void
    removeMember: (username: string) => void
    setPeerConnectionState: (username: string, connectionState: PeerConnectionState) => void
    setPeerMediaState: (username: string, media: { micMuted?: boolean; camOff?: boolean }) => void
    bumpStreamVersion: (username: string) => void
    setActiveMaxBitrate: (maxBitrate: number | null) => void
    setMicMuted: (micMuted: boolean) => void
    setCamOff: (camOff: boolean) => void
    reset: () => void
}

function member(username: string): RoomMember {
    return { username, connectionState: 'connecting', micMuted: false, camOff: false, streamVersion: 0 }
}

export const useRoomStore = create<RoomStoreState>((set) => ({
    roomId: null,
    selfId: null,
    members: {},
    incomingInvite: null,
    outgoingInvitees: [],
    micMuted: false,
    camOff: false,
    connectedAt: null,
    activeMaxBitrate: null,
    setIncomingInvite: (incomingInvite) => set({ incomingInvite }),
    setOutgoingInvitees: (outgoingInvitees) => set({ outgoingInvitees }),
    initRoom: (roomId, selfId, members) =>
        set(() => ({
            roomId,
            selfId,
            incomingInvite: null,
            outgoingInvitees: [],
            connectedAt: null,
            members: Object.fromEntries([selfId, ...members].map((username) => [username, member(username)])),
        })),
    addMember: (username) =>
        set((s) => ({
            members: s.members[username] ? s.members : { ...s.members, [username]: member(username) },
        })),
    removeMember: (username) =>
        set((s) => {
            const { [username]: _removed, ...members } = s.members
            return { members }
        }),
    setPeerConnectionState: (username, connectionState) =>
        set((s) => {
            const current = s.members[username] ?? member(username)
            return {
                members: { ...s.members, [username]: { ...current, connectionState } },
                connectedAt: connectionState === 'connected' && s.connectedAt == null ? Date.now() : s.connectedAt,
            }
        }),
    setPeerMediaState: (username, media) =>
        set((s) => {
            const current = s.members[username] ?? member(username)
            return {
                members: {
                    ...s.members,
                    [username]: {
                        ...current,
                        micMuted: media.micMuted ?? current.micMuted,
                        camOff: media.camOff ?? current.camOff,
                    },
                },
            }
        }),
    bumpStreamVersion: (username) =>
        set((s) => {
            const current = s.members[username] ?? member(username)
            return {
                members: {
                    ...s.members,
                    [username]: { ...current, streamVersion: current.streamVersion + 1 },
                },
            }
        }),
    setActiveMaxBitrate: (activeMaxBitrate) => set({ activeMaxBitrate }),
    setMicMuted: (micMuted) => set({ micMuted }),
    setCamOff: (camOff) => set({ camOff }),
    reset: () =>
        set({
            roomId: null,
            selfId: null,
            members: {},
            incomingInvite: null,
            outgoingInvitees: [],
            micMuted: false,
            camOff: false,
            connectedAt: null,
            activeMaxBitrate: null,
        }),
}))
