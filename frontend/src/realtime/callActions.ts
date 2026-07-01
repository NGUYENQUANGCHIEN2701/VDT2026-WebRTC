import { acquireLocalMedia, MediaAcquisitionError } from '../webrtc/media'
import {
    acquireAudioTrack,
    acquireVideoTrack,
    getCurrentTrack,
    replaceTrackInStream,
    stopTrack,
} from '../webrtc/mediaDevices'
import { PeerManager, type InboundSignal } from '../webrtc/PeerManager'
import { sendSignal, setCallSignalHandler } from './wsClient'
import { useCallStore } from '../store/callStore'
import { useAuthStore } from '../store/authStore'
import type { CallServerSignal, CallStateChanged } from './messages'
import { fetchIceConfig } from '../api/turn'
import { useToastStore } from '../store/toastStore'

// Object KHÔNG-serializable sống ở module scope (không vào Zustand)
let localStream: MediaStream | null = null
let peer: PeerManager | null = null
let peerGeneration = 0
let creatingPeerCallId: string | null = null
let cameraTrackBeforeShare: MediaStreamTrack | null = null
// Task 2 (Wave 4): store the camOff value BEFORE screen share overrides it
let camOffBeforeShare: boolean | null = null
let isRestoringCamera = false
// SDP/ICE có thể tới TRƯỚC khi peer kịp tạo (createPeer phải await fetchIceConfig).
// Đệm lại để KHÔNG rớt offer → tránh deadlock perfect-negotiation (kẹt "đang kết nối").
type BufferedSignal = InboundSignal & { callId: string }
let pendingSignals: BufferedSignal[] = []
function deliverSignal(callId: string, sig: InboundSignal) {
    const currentCallId = useCallStore.getState().callId
    if (creatingPeerCallId === callId) {
        pendingSignals.push({ ...sig, callId })
    } else if (peer && currentCallId === callId) {
        void peer.handleSignalingMessage(sig)
    }
    else pendingSignals.push({ ...sig, callId })
}

export function getLocalStream() { return localStream }
export function getRemoteStream() { return peer?.remoteStream ?? null }
export function getActivePeer(): PeerManager | null { return peer }

export function sendRecordingState(recording: boolean): void {
    const { remoteUserId, callId } = useCallStore.getState()
    if (remoteUserId && callId) {
        sendSignal({ type: 'recording-state', to: remoteUserId, callId, recording })
    }
}

function sendCurrentMediaState() {
    const { remoteUserId, micMuted, camOff } = useCallStore.getState()
    if (remoteUserId) sendSignal({ type: 'media-state', to: remoteUserId, micMuted, camOff })
}

// Task 1 (Wave 4): show UI-SPEC-approved strings only, never raw browser errors
function reportMediaControlError(message: string): void {
    useToastStore.getState().show(message, 'warning')
}

// Task 1 (Wave 4): unsupported-browser guard for getDisplayMedia
export const canScreenShare = (): boolean =>
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    'getDisplayMedia' in (navigator.mediaDevices as unknown as Record<string, unknown>)

export async function startScreenShare(): Promise<void> {
    if (!canScreenShare()) {
        reportMediaControlError('Screen sharing is unavailable in this browser.')
        return
    }

    const activePeer = peer
    const stream = localStream
    const cameraTrack = stream ? getCurrentTrack(stream, 'video') : null
    if (!activePeer || !stream || !cameraTrack) {
        reportMediaControlError('Screen sharing is unavailable — call not connected.')
        return
    }

    // Task 1: typed error handling for getDisplayMedia
    let displayStream: MediaStream
    try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    } catch (err) {
        if (err instanceof Error) {
            if (err.name === 'NotAllowedError') {
                reportMediaControlError(
                    'Screen sharing was not allowed. Try Share screen again and choose a window or screen.'
                )
            } else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
                reportMediaControlError(
                    'Could not start screen sharing. Try another window or screen.'
                )
            } else {
                reportMediaControlError('Screen sharing failed.')
            }
        } else {
            reportMediaControlError('Screen sharing failed.')
        }
        return
    }

    const screenTrack = displayStream.getVideoTracks()[0]
    if (!screenTrack) {
        reportMediaControlError('Screen sharing failed.')
        return
    }

    try {
        // Task 2: store cam-off state BEFORE overriding it
        camOffBeforeShare = useCallStore.getState().camOff
        cameraTrackBeforeShare = cameraTrack
        screenTrack.enabled = true
        await activePeer.replaceVideoTrack(screenTrack)
        replaceTrackInStream(stream, cameraTrack, screenTrack)
        screenTrack.onended = () => { void stopScreenShare() }

        const call = useCallStore.getState()
        call.setIsScreenSharing(true)
        // Screen share explicitly turns video on even if camera was off (D-09 decision)
        call.setCamOff(false)
        call.bumpLocalStream()
        sendCurrentMediaState()
    } catch (err) {
        stopTrack(screenTrack)
        camOffBeforeShare = null
        reportMediaControlError('Screen sharing failed.')
    }
}

export async function stopScreenShare(): Promise<void> {
    if (isRestoringCamera) return
    const activePeer = peer
    const stream = localStream
    const screenTrack = stream ? getCurrentTrack(stream, 'video') : null
    if (!activePeer || !stream || !screenTrack) return

    isRestoringCamera = true
    try {
        const call = useCallStore.getState()
        // Task 2: restore the ORIGINAL camOff value from before screen share started
        const restoredCamOff = camOffBeforeShare ?? call.camOff

        const reusableCamera =
            cameraTrackBeforeShare && cameraTrackBeforeShare.readyState !== 'ended'
                ? cameraTrackBeforeShare
                : null
        const cameraTrack = reusableCamera ?? await acquireVideoTrack(call.selectedCameraDeviceId ?? undefined)
        // Restore track enabled state to match pre-share camOff
        cameraTrack.enabled = !restoredCamOff

        await activePeer.replaceVideoTrack(cameraTrack)
        replaceTrackInStream(stream, screenTrack, cameraTrack)
        stopTrack(screenTrack)
        cameraTrackBeforeShare = null
        // Task 2: restore camOff in store to pre-share value
        call.setCamOff(restoredCamOff)
        camOffBeforeShare = null
        call.setIsScreenSharing(false)
        call.bumpLocalStream()
        // Task 2: relay restored media state to remote party
        sendCurrentMediaState()
    } catch (err) {
        reportMediaControlError('Could not restore camera after screen share stopped.')
    } finally {
        isRestoringCamera = false
    }
}

export async function switchCamera(deviceId: string): Promise<void> {
    const call = useCallStore.getState()
    // Task 2: while screen sharing, only update selected device — will apply on stopScreenShare
    if (call.isScreenSharing) {
        call.setSelectedCameraDeviceId(deviceId)
        return
    }

    const activePeer = peer
    const stream = localStream
    const oldTrack = stream ? getCurrentTrack(stream, 'video') : null
    if (!activePeer || !stream || !oldTrack) return

    let newTrack: MediaStreamTrack | null = null
    try {
        newTrack = await acquireVideoTrack(deviceId)
        newTrack.enabled = !call.camOff
        await activePeer.replaceVideoTrack(newTrack)
        replaceTrackInStream(stream, oldTrack, newTrack)
        stopTrack(oldTrack)
        call.setSelectedCameraDeviceId(deviceId)
        call.bumpLocalStream()
    } catch (err) {
        // Task 1: do NOT replace track on error — previous track stays active
        stopTrack(newTrack)
        if (err instanceof Error) {
            if (err.name === 'OverconstrainedError') {
                reportMediaControlError('Selected device is unavailable. Your current device is still active.')
            } else if (err.name === 'NotReadableError') {
                reportMediaControlError('That device is busy. Your current device is still active.')
            } else if (err.name === 'NotAllowedError') {
                reportMediaControlError('Permission denied for the selected device.')
            } else {
                reportMediaControlError('Could not switch camera. Your current device is still active.')
            }
        } else {
            reportMediaControlError('Could not switch camera. Your current device is still active.')
        }
    }
}

export async function switchMicrophone(deviceId: string): Promise<void> {
    const activePeer = peer
    const stream = localStream
    const oldTrack = stream ? getCurrentTrack(stream, 'audio') : null
    if (!activePeer || !stream || !oldTrack) return

    let newTrack: MediaStreamTrack | null = null
    try {
        const call = useCallStore.getState()
        newTrack = await acquireAudioTrack(deviceId)
        // Task 2: preserve mute state — do NOT call setMicMuted, store value unchanged
        newTrack.enabled = !call.micMuted
        await activePeer.replaceAudioTrack(newTrack)
        replaceTrackInStream(stream, oldTrack, newTrack)
        stopTrack(oldTrack)
        call.setSelectedMicrophoneDeviceId(deviceId)
    } catch (err) {
        // Task 1: do NOT replace track on error — previous track stays active
        stopTrack(newTrack)
        if (err instanceof Error) {
            if (err.name === 'OverconstrainedError') {
                reportMediaControlError('Selected device is unavailable. Your current device is still active.')
            } else if (err.name === 'NotReadableError') {
                reportMediaControlError('That device is busy. Your current device is still active.')
            } else if (err.name === 'NotAllowedError') {
                reportMediaControlError('Permission denied for the selected device.')
            } else {
                reportMediaControlError('Could not switch microphone. Your current device is still active.')
            }
        } else {
            reportMediaControlError('Could not switch microphone. Your current device is still active.')
        }
    }
}

// ── FE-C: nhớ cuộc đang diễn ra qua sessionStorage để sống sót F5 ──
// sessionStorage tự xóa khi đóng tab → key chỉ tồn tại đúng trường hợp REFRESH giữa cuộc.
const SAVED_CALL_KEY = 'activeCallId'
const SAVED_REMOTE_KEY = 'activeCallRemote'
function saveActiveCall(callId: string, remote: string) {
    sessionStorage.setItem(SAVED_CALL_KEY, callId)
    sessionStorage.setItem(SAVED_REMOTE_KEY, remote)
}
export function clearSavedCall() {
    sessionStorage.removeItem(SAVED_CALL_KEY)
    sessionStorage.removeItem(SAVED_REMOTE_KEY)
}
export function readSavedCall(): { callId: string; remote: string } | null {
    const callId = sessionStorage.getItem(SAVED_CALL_KEY)
    const remote = sessionStorage.getItem(SAVED_REMOTE_KEY)
    return callId && remote ? { callId, remote } : null
}

// Lấy camera/mic; true nếu OK, false nếu lỗi (đã set callStore.mediaError)
async function getMedia(): Promise<boolean> {
    if (localStream) return true   // đã có sẵn (vd glare: bên thua đã xin media lúc bấm Gọi)
    const call = useCallStore.getState()
    call.setMediaError(null)
    try {
        const media = await acquireLocalMedia()
        localStream = media.stream
        call.setMediaMode(media.mode)
        return true
    } catch (e) {
        call.setMediaError(e instanceof MediaAcquisitionError ? e.type : 'unknown')
        return false
    }
}

function forceRelayEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('relay') === '1'
}

async function createPeer(remoteUserId: string, callId: string, polite: boolean, generation: number): Promise<boolean> {
    const { iceServers, iceTransportPolicy } = await fetchIceConfig(forceRelayEnabled())
    if (generation !== peerGeneration) return false
    peer = new PeerManager(iceServers, polite, (sig) => {
        if (generation !== peerGeneration) return
        if (sig.type === 'sdp') sendSignal({ type: 'sdp', to: remoteUserId, callId, sdp: sig.sdp })
        else sendSignal({ type: 'ice-candidate', to: remoteUserId, callId, candidate: sig.candidate })
    }, iceTransportPolicy)
    // remote track tới (có thể SAU khi state đã 'connected') → bump để CallPage gắn lại srcObject
    peer.onRemoteStream = () => useCallStore.getState().bumpRemoteStream()
    if (localStream) peer.addLocalStream(localStream)
    // Xả tín hiệu đã đệm trong lúc await fetchIceConfig (vd offer của bên kia tới sớm)
    const buffered = pendingSignals.filter((sig) => sig.callId === callId)
    pendingSignals = pendingSignals.filter((sig) => sig.callId !== callId)
    for (const sig of buffered) await peer.handleSignalingMessage(sig)
    return true
}

// ── Vào cuộc 'active' (dùng cho cả lần đầu LẪN resync sau F5) ──
// FE-A: sau refresh store đã reset (callId rỗng) + mất localStream → phải dựng lại
// context từ message + xin lại camera/mic TRƯỚC khi tạo peer. getMedia idempotent
// nên lần đầu (đã có media) chỉ là no-op.
async function enterActiveCall(msg: CallStateChanged, amCaller: boolean, remote: string) {
    const generation = ++peerGeneration
    creatingPeerCallId = msg.callId
    pendingSignals = pendingSignals.filter((sig) => sig.callId === msg.callId)
    const call = useCallStore.getState()
    // RECONNECT (không phải active lần đầu) khi: đang giữ peer cũ (bên sống sót) HOẶC
    // store đã bị reset (bên vừa F5, callId rỗng).
    const isRebuild = peer != null || !call.callId

    if (!call.callId) {
        // resync sau F5: store trống → tái tạo context từ server (server là nguồn sự thật)
        if (amCaller) call.startOutgoing(remote, msg.callId)
        else call.startIncoming(remote, msg.callId)
    }
    if (isRebuild) call.setCallState('reconnecting') // overlay spinner; tránh nhấp nháy card

    saveActiveCall(msg.callId, remote)               // FE-C: nhớ để sống sót F5 kế tiếp
    if (!(await getMedia())) return                  // sau F5 phải xin lại media
    if (generation !== peerGeneration) return

    // Đóng PC CŨ trước khi dựng mới: bên kia đã có PC mới (DTLS mới) → không thể tái dùng
    // PC cũ. Cả 2 dựng lại từ đầu = đúng luồng active lần đầu.
    peer?.close()
    peer = null
    try {
        const created = await createPeer(remote, msg.callId, !amCaller, generation)  // caller=impolite, callee=polite
        if (created && generation === peerGeneration) call.setCallState('connecting')
    } finally {
        if (creatingPeerCallId === msg.callId && generation === peerGeneration) creatingPeerCallId = null
    }
}

// ── CALLER bấm Gọi → gửi INTENT; callId do server sinh, về qua 'ringing' ──
export async function startCall(remoteUsername: string) {
    useCallStore.getState().startOutgoing(remoteUsername, '')  // UI hiện ngay; callId điền khi ringing về
    if (!(await getMedia())) return
    sendSignal({ type: 'call-invite', to: remoteUsername })
}

// ── CALLEE bấm Nhận → gửi INTENT; peer tạo khi 'active' về (đối xứng 2 bên) ──
export async function acceptCall() {
    const { callId } = useCallStore.getState()
    if (!callId) return
    if (!(await getMedia())) return
    sendSignal({ type: 'call-accept', callId })
}

// ── Từ chối / Hủy / Cúp → gửi INTENT; teardown khi nhận 'ended' từ server ──
export function rejectCall() { sendIntent('call-reject') }
export function cancelCall() { sendIntent('call-cancel') }
export function hangUp() { sendIntent('hang-up') }

function sendIntent(type: 'call-reject' | 'call-cancel' | 'hang-up') {
    const { callId } = useCallStore.getState()
    if (callId) sendSignal({ type, callId })
}

// Dọn MEDIA (peer + stream). KHÔNG đụng store — để 'ended'/summary tự lo.
function teardownMedia() {
    peerGeneration++
    creatingPeerCallId = null
    peer?.close()
    peer = null
    localStream?.getTracks().forEach((t) => t.stop())  // tắt đèn camera
    localStream = null
    cameraTrackBeforeShare = null
    camOffBeforeShare = null
    isRestoringCamera = false
    pendingSignals = []   // bỏ tín hiệu đệm còn sót của cuộc vừa kết thúc
    clearSavedCall()   // FE-C: cuộc đã kết thúc → quên đi, F5 không khôi phục nữa
}

// ── Nhận tín hiệu từ server ──
function handleServerSignal(msg: CallServerSignal) {
    switch (msg.type) {
        case 'call-state-changed':
            handleCallState(msg)
            break
        case 'sdp-received':
            deliverSignal(msg.callId, { sdp: msg.sdp })
            break
        case 'ice-candidate-received':
            deliverSignal(msg.callId, { candidate: msg.candidate })
            break
        case 'media-state-relay': {
            const call = useCallStore.getState()
            call.setRemoteMicMuted(msg.micMuted)
            call.setRemoteCamOff(msg.camOff)
            break
        }
        case 'recording-state-relay': {
            const call = useCallStore.getState()
            if (call.callId === msg.callId) call.setRemoteRecording(msg.recording)
            break
        }
    }
}

// ── TRÁI TIM: render trạng thái server-authoritative ──
function handleCallState(msg: CallStateChanged) {
    const call = useCallStore.getState()
    const me = useAuthStore.getState().user?.username
    const amCaller = msg.callerId === me
    const remote = amCaller ? msg.calleeId : msg.callerId

    switch (msg.state) {
        case 'ringing':
            if (amCaller) {
                call.startOutgoing(remote, msg.callId)   // điền callId thật
            } else {
                // GLARE (D-04): mình đang GỌI ĐI chính người này thì lại nhận 'ringing'
                // với vai callee → Redis CAS đã giữ 1 cuộc và lật mình thành người nhận.
                // Tự động Nhận để nối liền 1 cuộc, không bắt user bấm lại.
                const isGlare = call.callState === 'outgoing' && call.remoteUserId === remote
                call.startIncoming(remote, msg.callId)               // → IncomingCallCard
                if (isGlare) acceptCall()
            }
            break
        case 'active':
            enterActiveCall(msg, amCaller, remote)
            break
        case 'ended': {
            teardownMedia()
            const reason = msg.reason ?? 'completed'

            if (reason === 'busy') {
                // chỉ caller nhận busy → toast trên Home, không vào màn call (D-05)
                useToastStore.getState().show(`${remote} đang bận`, 'warning')
                call.reset()
            } else if (reason === 'missed' && !amCaller) {
                // callee bỏ lỡ → toast tạm thời (D-09), không hiện summary
                useToastStore.getState().show(`Bạn đã nhỡ cuộc gọi từ ${remote}`, 'info')
                call.reset()
            } else if (reason === 'rejected' && !amCaller) {
                // callee từ chối cuộc gọi → về thẳng trang chủ, không hiện summary để tối ưu UX
                call.reset()
            } else {
                // completed/rejected/cancelled/dropped + missed phía caller → màn summary 3s
                call.endCall(reason)
                setTimeout(() => {
                    if (useCallStore.getState().callState === 'ended') useCallStore.getState().reset()
                }, 3000)
            }
            break
        }

    }
}

// Đăng ký 1 lần khi module load
setCallSignalHandler(handleServerSignal)
