import { getLocalStream } from './callActions'
import { sendSignal } from './wsClient'
import { useCallStore } from '../store/callStore'

function sendMediaState() {
    const { remoteUserId, micMuted, camOff, isScreenSharing } = useCallStore.getState()
    if (remoteUserId) sendSignal({ type: 'media-state', to: remoteUserId, micMuted, camOff, isScreenSharing })
}

export function toggleMic() {
    const track = getLocalStream()?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    useCallStore.getState().setMicMuted(!track.enabled)
    sendMediaState()                                   // ← báo bên kia
}

export function toggleCam() {
    const track = getLocalStream()?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    useCallStore.getState().setCamOff(!track.enabled)
    sendMediaState()                                   // ← báo bên kia
}
