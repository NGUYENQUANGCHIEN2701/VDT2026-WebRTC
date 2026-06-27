import { useEffect, useRef, useState } from 'react'
import { useCallStore } from '../store/callStore'
import { getActivePeer, getLocalStream, getRemoteStream, hangUp } from '../realtime/callActions'
import { CamToggleButton, HangUpButton, MuteButton } from '../components/call/CallButtons'
import AudioOnlyBadge from '../components/call/AudioOnlyBadge'
import { startStatsPolling, type StatsSample } from '../webrtc/stats'
import QualityIndicator from '../components/call/QualityIndicator'
import DebugPanel, { DebugToggle } from '../components/call/DebugPanel'
import { toggleCam, toggleMic } from '../realtime/mediaControls'
import RemoteCamOffOverlay from '../components/call/RemoteCamOffOverlay'
import RemoteMuteIndicator from '../components/call/RemoteMuteIndicator'
import { useCallDuration } from '../hooks/useCallDuration'

export default function CallPage() {
    const callState = useCallStore((s) => s.callState)
    const remoteUserId = useCallStore((s) => s.remoteUserId)
    const mediaMode = useCallStore((s) => s.mediaMode)
    const [debugOpen, setDebugOpen] = useState(false)
    const [stats, setStats] = useState<StatsSample | null>(null)
    const remoteRef = useRef<HTMLVideoElement>(null)
    const selfRef = useRef<HTMLVideoElement>(null)
    const micMuted = useCallStore((s) => s.micMuted)
    const camOff = useCallStore((s) => s.camOff)
    const remoteMicMuted = useCallStore((s) => s.remoteMicMuted)
    const remoteCamOff = useCallStore((s) => s.remoteCamOff)
    const duration = useCallDuration()
    
    // Gắn stream vào <video> mỗi khi state đổi (remote stream tới khi 'connected')
    useEffect(() => {
        if (remoteRef.current) remoteRef.current.srcObject = getRemoteStream()
        if (selfRef.current) selfRef.current.srcObject = getLocalStream()
    }, [callState])

    // Poll getStats CHỈ khi panel mở (STAB-04: không poll khi ẩn)
    useEffect(() => {
        if (!debugOpen) { setStats(null); return }
        const peer = getActivePeer()
        if (!peer) return
        return startStatsPolling(peer, setStats, 1000)   // trả stop() → cleanup tự gọi
    }, [debugOpen])
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
            {/* TOP BAR: chất lượng kết nối + nút bật/tắt debug */}
            <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
                <QualityIndicator callState={callState} stats={stats} />
                {duration && (
                    <span aria-label="Thời lượng cuộc gọi" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                        {duration}
                    </span>
                )}
                <DebugToggle open={debugOpen} onClick={() => setDebugOpen((v) => !v)} />
            </div>

            {/* video đối phương (full) + self-view PiP */}
            <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
                <video ref={remoteRef} autoPlay playsInline aria-label={`Camera của ${remoteUserId ?? ''}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: callState === 'reconnecting' ? 0.6 : 1 }} />
                {remoteCamOff && remoteUserId && <RemoteCamOffOverlay username={remoteUserId} />}
                {remoteMicMuted && <RemoteMuteIndicator />}
                {mediaMode === 'audio-only' && <AudioOnlyBadge />}
                <video ref={selfRef} autoPlay muted playsInline aria-label="Camera của bạn"
                    style={{ position: 'absolute', bottom: 8, right: 8, width: 160, height: 120, objectFit: 'cover', transform: 'scaleX(-1)', borderRadius: 4, border: '2px solid var(--bg)', background: '#000' }} />
            </div>

            {/* thanh điều khiển */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: 16 }}>
                <MuteButton muted={micMuted} onClick={toggleMic} />
                <CamToggleButton off={camOff} onClick={toggleCam} />
                <HangUpButton onClick={hangUp} />
            </div>

            {/* bảng debug: hiện dưới control bar khi mở */}
            {debugOpen && <DebugPanel stats={stats} />}
        </div>
    )
}
