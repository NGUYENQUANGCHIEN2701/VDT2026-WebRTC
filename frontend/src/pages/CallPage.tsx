import { useEffect, useRef, useState } from "react"
import { MonitorUp, Radio, Video, ShieldCheck, MoreVertical, Maximize } from "lucide-react"
import { useCallStore } from "../store/callStore"
import { useAuthStore } from "../store/authStore"
import {
  getActivePeer,
  getLocalStream,
  getRemoteStream,
  hangUp,
  sendRecordingState,
  startScreenShare,
  stopScreenShare,
  canScreenShare,
} from "../realtime/callActions"
import { LabeledMuteButton, LabeledCamButton, LabeledShareButton, LabeledRecordButton, LabeledMoreButton, LabeledHangUpButton } from "../components/call/CallButtons"
import AudioOnlyBadge from "../components/call/AudioOnlyBadge"
import { startStatsPolling, type StatsSample } from "../webrtc/stats"
import DebugPanel from "../components/call/DebugPanel"
import { toggleCam, toggleMic } from "../realtime/mediaControls"
import RemoteCamOffOverlay from "../components/call/RemoteCamOffOverlay"
import RemoteMuteIndicator from "../components/call/RemoteMuteIndicator"
import { useCallDuration } from "../hooks/useCallDuration"
import { RecordingController } from "../webrtc/recording"
import MorePanel from "../components/call/MorePanel"
import RecordingPreviewModal from "../components/call/RecordingPreviewModal"
import { useToastStore } from "../store/toastStore"

function formatElapsed(startedAt: number | null): string {
  if (!startedAt) return "00:00"
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const minutes = Math.floor(total / 60).toString().padStart(2, "0")
  const seconds = (total % 60).toString().padStart(2, "0")
  return `${minutes}:${seconds}`
}

export default function CallPage() {
  const callState = useCallStore((s) => s.callState)
  const remoteUserId = useCallStore((s) => s.remoteUserId)
  const mediaMode = useCallStore((s) => s.mediaMode)
  const [debugOpen, setDebugOpen] = useState(false)
  const [morePanelOpen, setMorePanelOpen] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [recordingNow, setRecordingNow] = useState(() => Date.now())
  const [recordingPreview, setRecordingPreview] = useState<{ url: string; mimeType: string; durationMs: number; downloadName: string } | null>(null)
  const [stats, setStats] = useState<StatsSample | null>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)
  const selfRef = useRef<HTMLVideoElement>(null)
  const recordingControllerRef = useRef<RecordingController | null>(null)
  const recordingPreviewUrlRef = useRef<string | null>(null)
  const micMuted = useCallStore((s) => s.micMuted)
  const camOff = useCallStore((s) => s.camOff)
  const remoteMicMuted = useCallStore((s) => s.remoteMicMuted)
  const remoteCamOff = useCallStore((s) => s.remoteCamOff)
  const remoteStreamVersion = useCallStore((s) => s.remoteStreamVersion)
  const localStreamVersion = useCallStore((s) => s.localStreamVersion)
  const selectedSpeakerDeviceId = useCallStore((s) => s.selectedSpeakerDeviceId)
  const isScreenSharing = useCallStore((s) => s.isScreenSharing)
  const remoteIsScreenSharing = useCallStore((s) => s.remoteIsScreenSharing)
  const isRecording = useCallStore((s) => s.isRecording)
  const recordingStartedAt = useCallStore((s) => s.recordingStartedAt)
  const remoteRecording = useCallStore((s) => s.remoteRecording)
  const hasRecordingPreview = useCallStore((s) => s.hasRecordingPreview)
  const duration = useCallDuration()

  // Ai đang chia sẻ màn hình? Local thắng nếu cả 2 cùng share (1-1 không có single-sharer lock phía server)
  const activeSharer: 'local' | 'remote' | null =
    isScreenSharing ? 'local' : remoteIsScreenSharing ? 'remote' : null

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
    const localStream = getLocalStream()
    if (selfRef.current) selfRef.current.srcObject = localStream
    if (localStream) recordingControllerRef.current?.refreshLocalStream(localStream)
  }, [localStreamVersion])

  useEffect(() => {
    if (!selectedSpeakerDeviceId || !remoteRef.current || !("setSinkId" in HTMLMediaElement.prototype)) return
    ;(remoteRef.current as HTMLMediaElement & { setSinkId: (sinkId: string) => Promise<void> })
      .setSinkId(selectedSpeakerDeviceId)
      .catch(() => { })
  }, [selectedSpeakerDeviceId])

  useEffect(() => {
    if (!isRecording) return
    const id = setInterval(() => setRecordingNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isRecording])

  useEffect(() => {
    recordingPreviewUrlRef.current = recordingPreview?.url ?? null
  }, [recordingPreview?.url])

  useEffect(() => {
    return () => {
      recordingControllerRef.current?.cleanup()
      if (recordingPreviewUrlRef.current) URL.revokeObjectURL(recordingPreviewUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (!debugOpen) return
    const peer = getActivePeer()
    if (!peer) return
    return startStatsPolling(peer, setStats, 1000)
  }, [debugOpen])

  const toggleShare = async () => {
    setShareLoading(true)
    try {
      if (isScreenSharing) await stopScreenShare()
      else await startScreenShare()
    } finally {
      setShareLoading(false)
    }
  }

  const startRecording = () => {
    const localStream = getLocalStream()
    const remoteStream = getRemoteStream()
    const call = useCallStore.getState()
    if (!localStream || !remoteStream || !call.callId || typeof MediaRecorder === "undefined") {
      useToastStore.getState().show('Recording is not ready yet.', 'warning')
      return
    }
    // remoteLabel dùng cho CẢ prop remoteLabel LẪN getActiveSharer — selectSharerVideo match remote theo label,
    // hai chuỗi lệch nhau là compositor vẽ placeholder thay vì video
    const remoteLabel = remoteUserId ?? "Remote"
    const controller = new RecordingController({
      callId: call.callId,
      localLabel: "You",
      remoteLabel,
      getActiveSharer: () => {
        const s = useCallStore.getState()
        if (s.isScreenSharing) return 'local'
        if (s.remoteIsScreenSharing) return remoteLabel
        return null
      },
      // Task 3: wire onerror — store sets error field, shown in UI with auto-dismiss
      onError: (msg) => {
        useCallStore.getState().setIsRecording(false)
        useCallStore.getState().setRecordingStartedAt(null)
        useCallStore.getState().setRecordingError(msg)
      },
    })
    recordingControllerRef.current = controller
    controller.start(localStream, remoteStream)
    sendRecordingState(true)
    call.setIsRecording(true)
    call.setRecordingStartedAt(Date.now())
    call.setRecordingError(null)
  }

  const stopRecording = async () => {
    const call = useCallStore.getState()
    const result = await recordingControllerRef.current?.stop()
    call.setIsRecording(false)
    call.setRecordingStartedAt(null)
    sendRecordingState(false)
    if (result) {
      if (recordingPreview?.url) URL.revokeObjectURL(recordingPreview.url)
      // Tên file tính một lần tại thời điểm dừng ghi (trong event handler),
      // không gọi Date.now() lúc render (react-hooks/purity).
      const downloadName = `call-${remoteUserId ?? "recording"}-${Date.now()}.webm`
      setRecordingPreview({ url: result.previewUrl, mimeType: result.mimeType, durationMs: result.durationMs, downloadName })
      call.setHasRecordingPreview(true)
    } else {
      // Task 3: empty chunks — no modal, toast only
      useToastStore.getState().show('No recording data was captured.', 'warning')
    }
  }

  const closeRecordingPreview = () => {
    if (recordingPreview?.url) URL.revokeObjectURL(recordingPreview.url)
    setRecordingPreview(null)
    useCallStore.getState().setHasRecordingPreview(false)
  }

  const endCall = () => {
    recordingControllerRef.current?.cleanup()
    recordingControllerRef.current = null
    hangUp()
  }

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

      <div className="call-hud-stack">
        {(isScreenSharing || remoteIsScreenSharing) && (
          <div className="hud-pill hud-pill--share">
            <MonitorUp size={16} />
            {isScreenSharing ? 'Sharing screen' : `${remoteUserId} is sharing`}
          </div>
        )}
        {isRecording && (
          <div className="hud-pill hud-pill--recording" role="status">
            <Radio size={15} />
            Recording {formatElapsed(recordingStartedAt || recordingNow)}
          </div>
        )}
        {remoteRecording && (
          <div className="hud-pill hud-pill--recording">
            <Radio size={15} />
            {remoteUserId} is recording
          </div>
        )}
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
        <MoreVertical size={18} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setDebugOpen((v) => {
          if (v) setStats(null) // đóng debug panel: xoá stats cũ ngay trong cùng handler (không dùng effect)
          return !v
        })} />
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
          data-testid="remote-video"
          aria-label={`Camera của ${remoteUserId ?? ""}`}
          className={[
            "call-video",
            callState === "reconnecting" ? "call-video--dimmed" : "",
            activeSharer === "remote" ? "call-video--presenting" : "",
            activeSharer === "local" ? "call-video--pip" : "",
          ].filter(Boolean).join(" ")}
        />
        {/* Overlay kích thước stage: ẩn khi remote bị thu thành PiP (mình đang share) kẻo che màn hình mình */}
        {activeSharer !== "local" && remoteCamOff && remoteUserId && <RemoteCamOffOverlay username={remoteUserId} />}
        {activeSharer !== "local" && remoteMicMuted && <RemoteMuteIndicator />}
        {mediaMode === "audio-only" && <AudioOnlyBadge />}
        {callState === "reconnecting" && (
          <div className="call-reconnect" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>Đang kết nối lại...</span>
          </div>
        )}
        {/* Self Video: LUÔN render <video> (không ẩn khi camOff) để ref ổn định */}
        <div className={activeSharer === "local" ? "self-video-box self-video-box--presenting" : "self-video-box"}>
          <video
            ref={selfRef}
            autoPlay
            muted
            playsInline
            data-testid="local-video"
            aria-label="Camera của bạn"
            className="self-video"
            // Đang share màn hình thì KHÔNG mirror — scaleX(-1) sẽ lật ngược chữ trên màn hình chia sẻ
            style={{ transform: isScreenSharing ? 'none' : 'scaleX(-1)', visibility: camOff ? 'hidden' : 'visible' }}
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
          {/* Nhãn "Bạn" nằm ở góc PiP — khi mình share, góc đó là video của REMOTE nên ẩn nhãn đi */}
          {activeSharer !== "local" && <div className="self-video-label">Bạn</div>}
        </div>
      </section>

      {/* Bottom Center HUD: Main Controls */}
      <footer className="call-1v1-bottom-bar">
        <LabeledMuteButton muted={micMuted} onClick={toggleMic} />
        <LabeledCamButton off={camOff} onClick={toggleCam} />
        <LabeledShareButton
          onClick={toggleShare}
          active={isScreenSharing}
          loading={shareLoading}
          disabled={!canScreenShare()}
          title={!canScreenShare() ? 'Screen sharing is unavailable in this browser.' : undefined}
        />
        <LabeledRecordButton onClick={() => isRecording ? void stopRecording() : startRecording()} active={isRecording} />
        <LabeledMoreButton onClick={() => setMorePanelOpen((open) => !open)} active={morePanelOpen} />
        <LabeledHangUpButton onClick={endCall} />
      </footer>

      <MorePanel
        open={morePanelOpen}
        onClose={() => setMorePanelOpen(false)}
        mode="1-1"
      />

      <RecordingPreviewModal
        open={hasRecordingPreview && Boolean(recordingPreview?.url)}
        previewUrl={recordingPreview?.url ?? null}
        mimeType={recordingPreview?.mimeType ?? "video/webm"}
        durationMs={recordingPreview?.durationMs ?? 0}
        downloadName={recordingPreview?.downloadName ?? `call-${remoteUserId ?? "recording"}.webm`}
        onClose={closeRecordingPreview}
      />

      {debugOpen && (
        <div style={{ position: 'absolute', top: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
          <DebugPanel stats={stats} />
        </div>
      )}
    </main>
  )
}
