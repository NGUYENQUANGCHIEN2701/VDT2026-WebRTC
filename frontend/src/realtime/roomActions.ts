import { fetchIceConfig } from '../api/turn'
import { useAuthStore } from '../store/authStore'
import { useRoomStore } from '../store/roomStore'
import { useToastStore } from '../store/toastStore'
import { MeshManager, remoteStreams } from '../webrtc/MeshManager'
import { acquireLocalMedia, MediaAcquisitionError } from '../webrtc/media'
import type { InboundSignal } from '../webrtc/PeerManager'
import type { CallServerSignal, RoomServerSignal } from './messages'
import { sendSignal, setRoomSignalHandler } from './wsClient'

let localStream: MediaStream | null = null
let mesh: MeshManager | null = null
let pendingSignals: Array<{ from: string; signal: InboundSignal }> = []

export function getRoomLocalStream(): MediaStream | null {
    return localStream
}

export function getRoomRemoteStream(username: string): MediaStream | null {
    return remoteStreams.get(username) ?? null
}

export function getActiveMesh(): MeshManager | null {
    return mesh
}

export function startGroupInvite(invitees: string[]): void {
    const selected = invitees.slice(0, 3)
    if (selected.length === 0) return
    useRoomStore.getState().setOutgoingInvitees(selected)
    sendSignal({ type: 'group-invite', to: selected })
}

export function acceptRoomInvite(): void {
    const invite = useRoomStore.getState().incomingInvite
    if (invite) sendSignal({ type: 'join-room', roomId: invite.roomId })
}

export function declineRoomInvite(): void {
    const invite = useRoomStore.getState().incomingInvite
    if (!invite) return
    sendSignal({ type: 'decline-room-invite', roomId: invite.roomId })
    useRoomStore.getState().setIncomingInvite(null)
}

export function leaveRoom(): void {
    const roomId = useRoomStore.getState().roomId
    if (roomId) sendSignal({ type: 'leave-room', roomId })
    teardownRoom()
}

async function ensureLocalMedia(): Promise<boolean> {
    if (localStream) return true
    try {
        localStream = (await acquireLocalMedia()).stream
        return true
    } catch (e) {
        const type = e instanceof MediaAcquisitionError ? e.type : 'unknown'
        useToastStore.getState().show(`Khong mo duoc camera/mic (${type})`, 'warning')
        return false
    }
}

function forceRelayEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('relay') === '1'
}

async function createMesh(roomId: string, members: string[]): Promise<void> {
    const selfId = useAuthStore.getState().user?.username
    if (!selfId || !(await ensureLocalMedia()) || !localStream) return

    mesh?.close()
    const { iceServers, iceTransportPolicy } = await fetchIceConfig(forceRelayEnabled())
    mesh = new MeshManager({
        selfId,
        localStream,
        iceServers,
        iceTransportPolicy,
        politeFor: (remoteUserId) => selfId > remoteUserId,
        sendSignal: (to, sig) => {
            if (sig.type === 'sdp') sendSignal({ type: 'sdp', to, callId: roomId, sdp: sig.sdp })
            else sendSignal({ type: 'ice-candidate', to, callId: roomId, candidate: sig.candidate })
        },
        onPeerConnectionStateChange: (username, state) => useRoomStore.getState().setPeerConnectionState(username, state),
        onRemoteStream: (username) => useRoomStore.getState().bumpStreamVersion(username),
    })

    useRoomStore.getState().initRoom(roomId, selfId, members)
    await mesh.joinExistingMembers(members)
    useRoomStore.getState().setActiveMaxBitrate(mesh.getActiveMaxBitrate())

    const buffered = pendingSignals
    pendingSignals = []
    for (const pending of buffered) {
        await mesh.handleSignal(pending.from, pending.signal)
    }
}

function deliverRoomSignal(roomId: string, from: string, signal: InboundSignal): void {
    if (roomId !== useRoomStore.getState().roomId) return
    if (mesh) void mesh.handleSignal(from, signal)
    else pendingSignals.push({ from, signal })
}

function teardownRoom(): void {
    mesh?.close()
    mesh = null
    localStream?.getTracks().forEach((track) => track.stop())
    localStream = null
    pendingSignals = []
    useRoomStore.getState().reset()
}

function updateBitrateStore(): void {
    useRoomStore.getState().setActiveMaxBitrate(mesh?.getActiveMaxBitrate() ?? null)
}

function handleRoomSignal(msg: RoomServerSignal | CallServerSignal): void {
    switch (msg.type) {
        case 'room-invite':
            useRoomStore.getState().setIncomingInvite({
                roomId: msg.roomId,
                from: msg.from,
                invitees: msg.invitees,
            })
            break
        case 'room-joined':
            void createMesh(msg.roomId, msg.members)
            break
        case 'participant-joined': {
            const room = useRoomStore.getState()
            if (msg.roomId !== room.roomId) return
            room.addMember(msg.username)
            const totalParticipants = Object.keys(useRoomStore.getState().members).length
            void mesh?.handleParticipantJoined(msg.username, totalParticipants).then(updateBitrateStore)
            break
        }
        case 'participant-left': {
            const room = useRoomStore.getState()
            if (msg.roomId !== room.roomId) return
            room.removeMember(msg.username)
            const totalParticipants = Object.keys(useRoomStore.getState().members).length
            void mesh?.handleParticipantLeft(msg.username, totalParticipants).then(updateBitrateStore)
            break
        }
        case 'room-full':
            if (msg.roomId === useRoomStore.getState().incomingInvite?.roomId) {
                useRoomStore.getState().setIncomingInvite(null)
            }
            useToastStore.getState().show('Phong da du 4 nguoi', 'info')
            break
        case 'sdp-received':
            deliverRoomSignal(msg.callId, msg.from, { sdp: msg.sdp })
            break
        case 'ice-candidate-received':
            deliverRoomSignal(msg.callId, msg.from, { candidate: msg.candidate })
            break
    }
}

setRoomSignalHandler(handleRoomSignal)
