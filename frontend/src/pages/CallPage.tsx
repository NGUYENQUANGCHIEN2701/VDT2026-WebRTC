import { useEffect, useRef, useState } from "react"
import { Video, ShieldCheck, MoreVertical, Maximize } from "lucide-react"
import { useCallStore } from "../store/callStore"
import { useAuthStore } from "../store/authStore"
import { getActivePeer, getLocalStream, getRemoteStream, hangUp } from "../realtime/callActions"
import { LabeledMuteButton, LabeledCamButton, LabeledShareButton, LabeledMoreButton, LabeledHangUpButton } from "../components/call/CallButtons"
import AudioOnlyBadge from "../components/call/AudioOnlyBadge"
import { startStatsPolling, type StatsSample } from "../webrtc/stats"
import DebugPanel from "../components/call/DebugPanel"
import { toggleCam, toggleMic } from "../realtime/mediaControls"
import RemoteCamOffOverlay from "../components/call/RemoteCamOffOverlay"
import RemoteMuteIndicator from "../components/call/RemoteMuteIndicator"
import { useCallDuration } from "../hooks/useCallDuration"

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
  const remoteStreamVersion = useCallStore((s) => s.remoteStreamVersion)
  const duration = useCallDuration()

  // ── Gán srcObject và ép trình duyệt tải lại track (khắc phục lỗi đen màn hình "khi được khi không") ──
  useEffect(() => {
    const remoteStream = getRemoteStream()
    if (remoteRef.current) {
      if (remoteRef.current.srcObject !== remoteStream) {
        remoteRef.current.srcObject = remoteStream
      } else if (remoteStream) {
        // Ép trình duyệt nhận lại track (ví dụ track video đến sau track audio)
        remoteRef.current.srcObject = null
        remoteRef.current.srcObject = remoteStream
      }
    }

    const localStream = getLocalStream()
    if (selfRef.current) {
      if (selfRef.current.srcObject !== localStream) {
        selfRef.current.srcObject = localStream
      } else if (localStream) {
        selfRef.current.srcObject = null
        selfRef.current.srcObject = localStream
      }
    }
  }, [callState, remoteStreamVersion])

  useEffect(() => {
    if (!debugOpen) {
      setStats(null)
      return
    }
    const peer = getActivePeer()
    if (!peer) return
    return startStatsPolling(peer, setStats, 1000)
  }, [debugOpen])

  return (
    <main className="call-page">
      {/* Top Left HUD: Call Info */}
      <div className="call-1v1-top-left">
        <div className="call-1v1-logo-box">
          <Video size={20} fill="white" />
        </div>
        <div className="call-1v1-info">
          <h2>Cuộc gọi 1-1</h2>
          <p>
            {remoteUserId}
            <span className="call-1v1-status-dot" />
          </p>
        </div>
      </div>

      {/* Top Center HUD: Status and Timer */}
      <div className="call-1v1-top-center">
        <div className="call-1v1-connected">
          <span className="call-1v1-status-dot" />
          {callState === "reconnecting" ? "Đang kết nối lại..." : "Đã kết nối"}
        </div>
        <span aria-label="Thời lượng cuộc gọi">
          {duration || "00:00"}
        </span>
        <ShieldCheck size={18} color="#22c55e" />
        <MoreVertical size={18} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setDebugOpen((v) => !v)} />
      </div>

      {/* Top Right HUD: Expand/Size */}
      <button className="call-1v1-top-right">
        <Maximize size={16} />
        Kích thước
      </button>

      {/* ── Video Stage: GIỮ NGUYÊN cấu trúc gốc ── */}
      <section className="call-video-stage">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          aria-label={`Camera của ${remoteUserId ?? ""}`}
          className={callState === "reconnecting" ? "call-video call-video--dimmed" : "call-video"}
        />
        {remoteCamOff && remoteUserId && <RemoteCamOffOverlay username={remoteUserId} />}
        {remoteMicMuted && <RemoteMuteIndicator />}
        {mediaMode === "audio-only" && <AudioOnlyBadge />}
        {callState === "reconnecting" && (
          <div className="call-reconnect" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>Đang kết nối lại...</span>
          </div>
        )}
        {/* Self Video: LUÔN render <video> (không ẩn khi camOff) để ref ổn định */}
        <video
          ref={selfRef}
          autoPlay
          muted
          playsInline
          aria-label="Camera của bạn"
          className="self-video"
          style={{ transform: 'scaleX(-1)', visibility: camOff ? 'hidden' : 'visible' }}
        />
        {camOff && (
          <div className="self-video" style={{ display: 'grid', placeItems: 'center', background: '#1f2937' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: 'var(--code-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#fff', fontWeight: 700
            }}>
              {useAuthStore.getState().user?.username?.charAt(0)?.toUpperCase() || 'B'}
            </div>
          </div>
        )}
        <div className="self-video-label">Bạn</div>
      </section>

      {/* Bottom Center HUD: Main Controls */}
      <footer className="call-1v1-bottom-bar">
        <LabeledMuteButton muted={micMuted} onClick={toggleMic} />
        <LabeledCamButton off={camOff} onClick={toggleCam} />
        <LabeledShareButton onClick={() => {}} />
        <LabeledMoreButton onClick={() => {}} />
        <LabeledHangUpButton onClick={hangUp} />
      </footer>

      {debugOpen && (
        <div style={{ position: 'absolute', top: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
          <DebugPanel stats={stats} />
        </div>
      )}
    </main>
  )
}
