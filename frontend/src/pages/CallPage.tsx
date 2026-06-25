import { useEffect, useRef } from 'react'
import { useCallStore, type CallState } from '../store/callStore'
import { getLocalStream, getRemoteStream, hangUp } from '../realtime/callActions'
import { HangUpButton } from '../components/call/CallButtons'
import AudioOnlyBadge from '../components/call/AudioOnlyBadge'

const ICE_TEXT: Partial<Record<CallState, string>> = {
    connecting: 'Đang kết nối…',
    connected: 'Đã kết nối',
    reconnecting: 'Đang kết nối lại…',
    failed: 'Kết nối thất bại',
}
const DOT: Partial<Record<CallState, string>> = {
    connecting: '#6b7280', connected: '#16a34a', reconnecting: '#dc2626', failed: '#dc2626',
}

export default function CallPage() {
    const callState = useCallStore((s) => s.callState)
    const remoteUserId = useCallStore((s) => s.remoteUserId)
    const mediaMode = useCallStore((s) => s.mediaMode)
    const remoteRef = useRef<HTMLVideoElement>(null)
    const selfRef = useRef<HTMLVideoElement>(null)

    // Gắn stream vào <video> mỗi khi state đổi (remote stream tới khi 'connected')
    useEffect(() => {
        if (remoteRef.current) remoteRef.current.srcObject = getRemoteStream()
        if (selfRef.current) selfRef.current.srcObject = getLocalStream()
    }, [callState])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
            {/* thanh trạng thái ICE */}
            <div role="status" aria-live="polite"
                style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', fontSize: 14, fontWeight: 600 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[callState] ?? '#6b7280' }} />
                <span>{ICE_TEXT[callState] ?? ''}</span>
            </div>

            {/* video đối phương (full) + self-view PiP */}
            <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
                <video ref={remoteRef} autoPlay playsInline aria-label={`Camera của ${remoteUserId ?? ''}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: callState === 'reconnecting' ? 0.6 : 1 }} />
                {mediaMode === 'audio-only' && <AudioOnlyBadge />}
                <video ref={selfRef} autoPlay muted playsInline aria-label="Camera của bạn"
                    style={{ position: 'absolute', bottom: 8, right: 8, width: 160, height: 120, objectFit: 'cover', transform: 'scaleX(-1)', borderRadius: 4, border: '2px solid var(--bg)', background: '#000' }} />
            </div>

            {/* thanh điều khiển */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                <HangUpButton onClick={hangUp} />
            </div>
        </div>
    )
}
