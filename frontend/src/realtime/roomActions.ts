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
let pendingSignals: Array<{ roomId: string; from: string; signal: InboundSignal }> = []
let creatingRoomId: string | null = null
let pendingInitialMembers = new Set<string>()
let initialMembersCanInitiateOffer = false
let meshSetup: Promise<void> | null = null

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
    if (selected.length < 2) return
    useRoomStore.getState().setOutgoingInvitees(selected)
    sendSignal({ type: 'group-invite', to: selected })
}

export function cancelGroupInvite(): void {
    const invitees = useRoomStore.getState().outgoingInvitees
    useRoomStore.getState().setOutgoingInvitees([])
    sendSignal({ type: 'cancel-group-invite', to: invitees })
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

export function toggleRoomMic(): void {
    const track = localStream?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    const micMuted = !track.enabled
    useRoomStore.getState().setMicMuted(micMuted)
    sendRoomMediaState()
}

export function toggleRoomCam(): void {
    const track = localStream?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    const camOff = !track.enabled
    useRoomStore.getState().setCamOff(camOff)
    sendRoomMediaState()
}

function sendRoomMediaState(): void {
    const { members, selfId, micMuted, camOff } = useRoomStore.getState()
    for (const username of Object.keys(members)) {
        if (username !== selfId) sendSignal({ type: 'media-state', to: username, micMuted, camOff })
    }
}

async function ensureLocalMedia(): Promise<boolean> {
    if (localStream) return true
    try {
        localStream = (await acquireLocalMedia()).stream
        return true
    } catch (e) {
        const type = e instanceof MediaAcquisitionError ? e.type : 'unknown'
        useToastStore.getState().show(`Không mở được camera/mic (${type})`, 'warning')
        return false
    }
}

function forceRelayEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('relay') === '1'
}

function createMesh(roomId: string, members: string[], canInitiateInitialMembers = false): Promise<void> {
    if (creatingRoomId === roomId && meshSetup) {
        for (const member of members) pendingInitialMembers.add(member)
        initialMembersCanInitiateOffer = initialMembersCanInitiateOffer || canInitiateInitialMembers
        return meshSetup
    }

    creatingRoomId = roomId
    pendingInitialMembers = new Set(members)
    initialMembersCanInitiateOffer = canInitiateInitialMembers
    meshSetup = doCreateMesh(roomId).finally(() => {
        if (creatingRoomId === roomId) {
            creatingRoomId = null
            pendingInitialMembers.clear()
            initialMembersCanInitiateOffer = false
            meshSetup = null
        }
    })
    return meshSetup
}

async function doCreateMesh(roomId: string): Promise<void> {
    const selfId = useAuthStore.getState().user?.username
    if (!selfId || !(await ensureLocalMedia()) || !localStream) return

    mesh?.close()
    const { iceServers, iceTransportPolicy } = await fetchIceConfig(forceRelayEnabled())
    const members = [...pendingInitialMembers]
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
    useRoomStore.getState().setOutgoingInvitees([])
    await mesh.joinExistingMembers(members, initialMembersCanInitiateOffer)
    useRoomStore.getState().setActiveMaxBitrate(mesh.getActiveMaxBitrate())

    const buffered = pendingSignals.filter((pending) => pending.roomId === roomId)
    pendingSignals = pendingSignals.filter((pending) => pending.roomId !== roomId)
    for (const pending of buffered) {
        await mesh.handleSignal(pending.from, pending.signal)
    }
}

function deliverRoomSignal(roomId: string, from: string, signal: InboundSignal): void {
    const currentRoomId = useRoomStore.getState().roomId
    if (mesh && currentRoomId === roomId) {
        void mesh.handleSignal(from, signal)
    } else if (!currentRoomId || currentRoomId === roomId || creatingRoomId === roomId) {
        pendingSignals.push({ roomId, from, signal })
    }
}

function teardownRoom(): void {
    creatingRoomId = null
    pendingInitialMembers.clear()
    initialMembersCanInitiateOffer = false
    meshSetup = null
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
            createMesh(msg.roomId, msg.members, true).then(() => {
                sendRoomMediaState()
            })
            break
        case 'participant-joined': {
            const room = useRoomStore.getState()
            if (!room.roomId && room.outgoingInvitees.length > 0) {
                void createMesh(msg.roomId, [msg.username], true)
                break
            }
            if (msg.roomId !== room.roomId) return
            room.addMember(msg.username)
            sendSignal({ type: 'media-state', to: msg.username, micMuted: room.micMuted, camOff: room.camOff })
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
        case 'room-invite-cancelled':
            if (msg.roomId === useRoomStore.getState().incomingInvite?.roomId) {
                useRoomStore.getState().setIncomingInvite(null)
                useToastStore.getState().show('Người tạo nhóm đã hủy cuộc gọi', 'info')
            }
            break
        case 'room-invite-declined': {
            const room = useRoomStore.getState()
            if (!room.outgoingInvitees.includes(msg.username)) return
            room.addDeclinedInvitee(msg.username)
            useToastStore.getState().show(`${msg.username} đã từ chối tham gia`, 'warning')

            const updated = useRoomStore.getState()
            const joinedInvitees = Object.keys(updated.members).filter((username) => username !== updated.selfId)
            const everyoneDeclined = updated.outgoingInvitees.every((username) =>
                updated.declinedInvitees.includes(username)
            )

            if (!updated.roomId && joinedInvitees.length === 0 && everyoneDeclined) {
                sendSignal({ type: 'leave-room', roomId: msg.roomId })
                useToastStore.getState().show('Tất cả người được mời đã từ chối', 'info')
                useRoomStore.getState().setOutgoingInvitees([])
            }
            break
        }
        case 'room-full':
            if (msg.roomId === useRoomStore.getState().incomingInvite?.roomId) {
                useRoomStore.getState().setIncomingInvite(null)
            }
            useToastStore.getState().show('Phòng đã đầy (tối đa 4 người)', 'info')
            useRoomStore.getState().setOutgoingInvitees([])
            break
        case 'media-state-relay':
            useRoomStore.getState().setPeerMediaState(msg.from, { micMuted: msg.micMuted, camOff: msg.camOff })
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
