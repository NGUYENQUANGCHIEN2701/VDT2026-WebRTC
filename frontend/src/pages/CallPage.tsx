import { useEffect, useRef, useState } from "react"
import { useCallStore } from "../store/callStore"
import { getActivePeer, getLocalStream, getRemoteStream, hangUp } from "../realtime/callActions"
import { CamToggleButton, HangUpButton, MuteButton } from "../components/call/CallButtons"
import AudioOnlyBadge from "../components/call/AudioOnlyBadge"
import { startStatsPolling, type StatsSample } from "../webrtc/stats"
import QualityIndicator from "../components/call/QualityIndicator"
import DebugPanel, { DebugToggle } from "../components/call/DebugPanel"
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

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = getRemoteStream()
    if (selfRef.current) selfRef.current.srcObject = getLocalStream()
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
      <header className="call-hud call-hud--top">
        <QualityIndicator callState={callState} stats={stats} />
        {duration && (
          <span className="call-duration" aria-label="Thời lượng cuộc gọi">
            {duration}
          </span>
        )}
        <DebugToggle open={debugOpen} onClick={() => setDebugOpen((v) => !v)} />
      </header>

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
        <video
          ref={selfRef}
          autoPlay
          muted
          playsInline
          aria-label="Camera của bạn"
          className="self-video"
        />
      </section>

      <footer className="call-hud call-controls">
        <MuteButton muted={micMuted} onClick={toggleMic} />
        <CamToggleButton off={camOff} onClick={toggleCam} />
        <HangUpButton onClick={hangUp} />
      </footer>

      {debugOpen && <DebugPanel stats={stats} />}
    </main>
  )
}
