import { fetchIceConfig } from '../api/turn'
import { useAuthStore } from '../store/authStore'
import { getActiveSharer, useRoomStore } from '../store/roomStore'
import { useToastStore } from '../store/toastStore'
import { MeshManager, remoteStreams } from '../webrtc/MeshManager'
import { acquireLocalMedia, MediaAcquisitionError } from '../webrtc/media'
import {
    acquireAudioTrack,
    acquireVideoTrack,
    getCurrentTrack,
    replaceTrackInStream,
    stopTrack,
} from '../webrtc/mediaDevices'
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
let roomCameraTrackBeforeShare: MediaStreamTrack | null = null
// Task 2 (Wave 4): store camOff before screen share overrides it
let roomCamOffBeforeShare: boolean | null = null
let isRestoringRoomCamera = false

export function getRoomLocalStream(): MediaStream | null {
    return localStream
}

export function getRoomRemoteStream(username: string): MediaStream | null {
    return remoteStreams.get(username) ?? null
}

export function getActiveMesh(): MeshManager | null {
    return mesh
}

// Task 1 (Wave 4): show UI-SPEC-approved strings, never raw browser errors
function reportRoomMediaControlError(message: string): void {
    useToastStore.getState().show(message, 'warning')
}

// Task 1 (Wave 4): unsupported-browser guard for getDisplayMedia
export const canRoomScreenShare = (): boolean =>
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    'getDisplayMedia' in (navigator.mediaDevices as unknown as Record<string, unknown>)

export async function startRoomScreenShare(): Promise<void> {
    if (!canRoomScreenShare()) {
        reportRoomMediaControlError('Screen sharing is unavailable in this browser.')
        return
    }

    // Client-side pre-check (UX fast-path): if a synced remote member is already
    // marked as the active sharer, reject before ever touching getDisplayMedia.
    // The server-side claim in Task 1 remains the authoritative backstop for races.
    const { members, selfId, isScreenSharing } = useRoomStore.getState()
    const existingSharer = getActiveSharer(members, selfId, isScreenSharing)
    if (existingSharer !== null && existingSharer !== selfId) {
        reportRoomMediaControlError('Someone else is already sharing their screen.')
        return
    }

    const activeMesh = mesh
    const stream = localStream
    const cameraTrack = stream ? getCurrentTrack(stream, 'video') : null
    if (!activeMesh || !stream || !cameraTrack) {
        reportRoomMediaControlError('Screen sharing is unavailable — call not connected.')
        return
    }

    // Task 1: typed error handling for getDisplayMedia
    let displayStream: MediaStream
    try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    } catch (err) {
        if (err instanceof Error) {
            if (err.name === 'NotAllowedError') {
                reportRoomMediaControlError(
                    'Screen sharing was not allowed. Try Share screen again and choose a window or screen.'
                )
            } else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
                reportRoomMediaControlError(
                    'Could not start screen sharing. Try another window or screen.'
                )
            } else {
                reportRoomMediaControlError('Screen sharing failed.')
            }
        } else {
            reportRoomMediaControlError('Screen sharing failed.')
        }
        return
    }

    const screenTrack = displayStream.getVideoTracks()[0]
    if (!screenTrack) {
        reportRoomMediaControlError('Screen sharing failed.')
        return
    }

    try {
        // Task 2: store camOff BEFORE overriding it
        roomCamOffBeforeShare = useRoomStore.getState().camOff
        roomCameraTrackBeforeShare = cameraTrack
        screenTrack.enabled = true
        await activeMesh.replaceVideoTrack(screenTrack)
        replaceTrackInStream(stream, cameraTrack, screenTrack)
        screenTrack.onended = () => { void stopRoomScreenShare() }

        const room = useRoomStore.getState()
        room.setIsScreenSharing(true)
        // Screen share explicitly turns video on even if camera was off (D-09)
        room.setCamOff(false)
        room.bumpLocalStream()
        sendRoomMediaState()
    } catch {
        stopTrack(screenTrack)
        roomCamOffBeforeShare = null
        reportRoomMediaControlError('Screen sharing failed.')
    }
}

export async function stopRoomScreenShare(): Promise<void> {
    if (isRestoringRoomCamera) return
    const activeMesh = mesh
    const stream = localStream
    const screenTrack = stream ? getCurrentTrack(stream, 'video') : null
    if (!activeMesh || !stream || !screenTrack) return

    isRestoringRoomCamera = true
    try {
        const room = useRoomStore.getState()
        // Task 2: restore the ORIGINAL camOff value from before screen share started
        const restoredCamOff = roomCamOffBeforeShare ?? room.camOff

        const reusableCamera =
            roomCameraTrackBeforeShare && roomCameraTrackBeforeShare.readyState !== 'ended'
                ? roomCameraTrackBeforeShare
                : null
        const cameraTrack = reusableCamera ?? await acquireVideoTrack(room.selectedCameraDeviceId ?? undefined)
        // Restore track enabled state to match pre-share camOff
        cameraTrack.enabled = !restoredCamOff

        await activeMesh.replaceVideoTrack(cameraTrack)
        replaceTrackInStream(stream, screenTrack, cameraTrack)
        stopTrack(screenTrack)
        roomCameraTrackBeforeShare = null
        // Task 2: restore camOff in store to pre-share value
        room.setCamOff(restoredCamOff)
        roomCamOffBeforeShare = null
        room.setIsScreenSharing(false)
        room.bumpLocalStream()
        // Task 2: relay restored media state to all remote participants
        sendRoomMediaState()
    } catch {
        reportRoomMediaControlError('Could not restore camera after screen share stopped.')
    } finally {
        isRestoringRoomCamera = false
    }
}

export async function switchRoomCamera(deviceId: string): Promise<void> {
    const room = useRoomStore.getState()
    // Task 2: while screen sharing, only update selected device — will apply on stopRoomScreenShare
    if (room.isScreenSharing) {
        room.setSelectedCameraDeviceId(deviceId)
        return
    }

    const activeMesh = mesh
    const stream = localStream
    const oldTrack = stream ? getCurrentTrack(stream, 'video') : null
    if (!activeMesh || !stream || !oldTrack) return

    let newTrack: MediaStreamTrack | null = null
    try {
        newTrack = await acquireVideoTrack(deviceId)
        newTrack.enabled = !room.camOff
        await activeMesh.replaceVideoTrack(newTrack)
        replaceTrackInStream(stream, oldTrack, newTrack)
        stopTrack(oldTrack)
        room.setSelectedCameraDeviceId(deviceId)
        room.bumpLocalStream()
    } catch (err) {
        // Task 1: do NOT replace track on error — previous track stays active
        stopTrack(newTrack)
        if (err instanceof Error) {
            if (err.name === 'OverconstrainedError') {
                reportRoomMediaControlError('Selected device is unavailable. Your current device is still active.')
            } else if (err.name === 'NotReadableError') {
                reportRoomMediaControlError('That device is busy. Your current device is still active.')
            } else if (err.name === 'NotAllowedError') {
                reportRoomMediaControlError('Permission denied for the selected device.')
            } else {
                reportRoomMediaControlError('Could not switch camera. Your current device is still active.')
            }
        } else {
            reportRoomMediaControlError('Could not switch camera. Your current device is still active.')
        }
    }
}

export async function switchRoomMicrophone(deviceId: string): Promise<void> {
    const activeMesh = mesh
    const stream = localStream
    const oldTrack = stream ? getCurrentTrack(stream, 'audio') : null
    if (!activeMesh || !stream || !oldTrack) return

    let newTrack: MediaStreamTrack | null = null
    try {
        const room = useRoomStore.getState()
        newTrack = await acquireAudioTrack(deviceId)
        // Task 2: preserve mute state — do NOT call setMicMuted, store value unchanged
        newTrack.enabled = !room.micMuted
        await activeMesh.replaceAudioTrack(newTrack)
        replaceTrackInStream(stream, oldTrack, newTrack)
        stopTrack(oldTrack)
        room.setSelectedMicrophoneDeviceId(deviceId)
    } catch (err) {
        // Task 1: do NOT replace track on error — previous track stays active
        stopTrack(newTrack)
        if (err instanceof Error) {
            if (err.name === 'OverconstrainedError') {
                reportRoomMediaControlError('Selected device is unavailable. Your current device is still active.')
            } else if (err.name === 'NotReadableError') {
                reportRoomMediaControlError('That device is busy. Your current device is still active.')
            } else if (err.name === 'NotAllowedError') {
                reportRoomMediaControlError('Permission denied for the selected device.')
            } else {
                reportRoomMediaControlError('Could not switch microphone. Your current device is still active.')
            }
        } else {
            reportRoomMediaControlError('Could not switch microphone. Your current device is still active.')
        }
    }
}

export async function setRoomSinkId(deviceId: string): Promise<void> {
    useRoomStore.getState().setSelectedSpeakerDeviceId(deviceId)
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
    const { members, selfId, micMuted, camOff, isScreenSharing } = useRoomStore.getState()
    for (const username of Object.keys(members)) {
        if (username !== selfId) sendSignal({ type: 'media-state', to: username, micMuted, camOff, isScreenSharing })
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
    roomCameraTrackBeforeShare = null
    roomCamOffBeforeShare = null
    isRestoringRoomCamera = false
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
            sendSignal({
                type: 'media-state',
                to: msg.username,
                micMuted: room.micMuted,
                camOff: room.camOff,
                isScreenSharing: room.isScreenSharing,
            })
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
            useRoomStore.getState().setPeerMediaState(msg.from, {
                micMuted: msg.micMuted,
                camOff: msg.camOff,
                isScreenSharing: msg.isScreenSharing,
            })
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
