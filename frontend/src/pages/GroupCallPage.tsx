import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useNavigate } from "react-router-dom"
import { MonitorUp, Video, LayoutGrid, MoreVertical, Settings, ShieldCheck, Signal, Radio } from "lucide-react"
import { LabeledMuteButton, LabeledCamButton, LabeledShareButton, LabeledRecordButton, LabeledMoreButton, LabeledHangUpButton } from "../components/call/CallButtons"
import DebugPanel, { type PeerDebugStats } from "../components/call/DebugPanel"
import ParticipantTile from "../components/call/ParticipantTile"
import {
  getActiveMesh,
  getRoomLocalStream,
  getRoomRemoteStream,
  leaveRoom,
  startRoomScreenShare,
  stopRoomScreenShare,
  toggleRoomCam,
  toggleRoomMic,
  canRoomScreenShare,
} from "../realtime/roomActions"
import { useRoomStore } from "../store/roomStore"
import { startStatsPolling, type StatsSample } from "../webrtc/stats"
import MorePanel from "../components/call/MorePanel"
import "./GroupCallStyles.css"
import { RecordingController } from "../webrtc/recording"
import RecordingPreviewModal from "../components/call/RecordingPreviewModal"
import { useToastStore } from "../store/toastStore"
function formatDuration(startedAt: number | null) {
  if (!startedAt) return "00:00"
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const minutes = Math.floor(total / 60).toString().padStart(2, "0")
  const seconds = (total % 60).toString().padStart(2, "0")
  return `${minutes}:${seconds}`
}

function gridStyle(count: number): CSSProperties {
  if (count <= 2) {
    return { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: '1fr' }
  }
  return { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))' }
}

export default function GroupCallPage() {
  const navigate = useNavigate()
  const roomId = useRoomStore((s) => s.roomId)
  const selfId = useRoomStore((s) => s.selfId)
  const members = useRoomStore((s) => s.members)
  const micMuted = useRoomStore((s) => s.micMuted)
  const camOff = useRoomStore((s) => s.camOff)
  const connectedAt = useRoomStore((s) => s.connectedAt)
  const activeMaxBitrate = useRoomStore((s) => s.activeMaxBitrate)
  const isScreenSharing = useRoomStore((s) => s.isScreenSharing)
  const localStreamVersion = useRoomStore((s) => s.localStreamVersion)
  const selectedSpeakerDeviceId = useRoomStore((s) => s.selectedSpeakerDeviceId)
  const [debugOpen, setDebugOpen] = useState(false)
  const [morePanelOpen, setMorePanelOpen] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [recordingNow, setRecordingNow] = useState(Date.now())
  const [recordingPreview, setRecordingPreview] = useState<{ url: string; mimeType: string; durationMs: number } | null>(null)
  const recordingControllerRef = useRef<RecordingController | null>(null)
  const recordingPreviewUrlRef = useRef<string | null>(null)

  const isRecording = useRoomStore((s) => s.isRecording)
  const recordingStartedAt = useRoomStore((s) => s.recordingStartedAt)
  const hasRecordingPreview = useRoomStore((s) => s.hasRecordingPreview)
  const [statsByPeer, setStatsByPeer] = useState<Record<string, StatsSample | null>>({})
  const selfVideoVersion = useRef(0)

  const roster = useMemo(() => Object.values(members), [members])
  const remoteMembers = roster.filter((m) => m.username !== selfId)
  const alone = Boolean(roomId && roster.length === 1)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

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
    if (!alone) return
    const timer = setTimeout(() => navigate("/", { replace: true }), 2000)
    return () => clearTimeout(timer)
  }, [alone, navigate])

  useEffect(() => {
    if (!debugOpen) {
      setStatsByPeer({})
      return
    }
    const mesh = getActiveMesh()
    if (!mesh) return
    const stops = remoteMembers
      .map((member) => {
        const peer = mesh.getPeer(member.username)
        if (!peer) return null
        return startStatsPolling(peer, (sample) => {
          setStatsByPeer((current) => ({ ...current, [member.username]: sample }))
        }, 1000)
      })
      .filter((stop): stop is () => void => Boolean(stop))
    return () => stops.forEach((stop) => stop())
  }, [debugOpen, remoteMembers.map((m) => m.username).join("|")])

  const peerDebug: PeerDebugStats[] = remoteMembers.map((member) => ({
    peerId: member.username,
    stats: statsByPeer[member.username] ?? null,
    maxBitrateKbps: activeMaxBitrate != null ? Math.round(activeMaxBitrate / 1000) : null,
  }))

  const toggleShare = async () => {
    setShareLoading(true)
    try {
      if (isScreenSharing) await stopRoomScreenShare()
      else await startRoomScreenShare()
    } finally {
      setShareLoading(false)
    }
  }

  const startRecording = () => {
    const localStream = getRoomLocalStream()
    const room = useRoomStore.getState()
    const remoteStreams = remoteMembers.map(m => getRoomRemoteStream(m.username)).filter(Boolean) as MediaStream[]
    
    if (!localStream || !room.roomId || typeof MediaRecorder === "undefined") {
      useToastStore.getState().show('Recording is not ready yet.', 'warning')
      return
    }
    const controller = new RecordingController({
      callId: room.roomId,
      localLabel: "You",
      isScreenSharing: () => useRoomStore.getState().isScreenSharing,
      onError: (msg) => {
        useRoomStore.getState().setIsRecording(false)
        useRoomStore.getState().setRecordingStartedAt(null)
        useRoomStore.getState().setRecordingError(msg)
      },
    })
    recordingControllerRef.current = controller
    const remoteLabels = remoteMembers.map(m => m.username)
    controller.start(localStream, remoteStreams, room.roomId, remoteLabels)
    room.setIsRecording(true)
    room.setRecordingStartedAt(Date.now())
    room.setRecordingError(null)
  }

  const stopRecording = async () => {
    const room = useRoomStore.getState()
    const result = await recordingControllerRef.current?.stop()
    room.setIsRecording(false)
    room.setRecordingStartedAt(null)
    if (result) {
      if (recordingPreview?.url) URL.revokeObjectURL(recordingPreview.url)
      setRecordingPreview({ url: result.previewUrl, mimeType: result.mimeType, durationMs: result.durationMs })
      room.setHasRecordingPreview(true)
    } else {
      useToastStore.getState().show('No recording data was captured.', 'warning')
    }
  }

  const closeRecordingPreview = () => {
    if (recordingPreview?.url) URL.revokeObjectURL(recordingPreview.url)
    setRecordingPreview(null)
    useRoomStore.getState().setHasRecordingPreview(false)
  }

  const tiles = roster.map((member, index) => {
    const isSelf = member.username === selfId
    const isThirdInThree = roster.length === 3 && index === 2
    return (
      <div 
        key={member.username} 
        style={{ 
          ...(isThirdInThree ? { gridColumn: '1 / -1', justifySelf: 'center', width: '50%' } : {}),
          minWidth: 0, 
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
        }}
      >
        <ParticipantTile
          username={member.username}
          isSelf={isSelf}
          stream={isSelf ? getRoomLocalStream() : getRoomRemoteStream(member.username)}
          streamVersion={isSelf ? localStreamVersion + selfVideoVersion.current : member.streamVersion}
          micMuted={isSelf ? micMuted : member.micMuted}
          camOff={isSelf ? camOff : member.camOff}
          connectionState={isSelf ? 'connected' : member.connectionState}
          sinkId={isSelf ? null : selectedSpeakerDeviceId}
          isScreenSharing={isSelf && isScreenSharing}
        />
      </div>
    )
  })

  return (
    <main className="call-page">
      {/* Top Left HUD: Call Info */}
      <div className="call-1v1-top-left">
        <div className="call-1v1-logo-box">
          <Video size={20} fill="white" />
        </div>
        <div className="call-1v1-info">
          <h2>Video Call</h2>
          <p>Cuộc họp nhóm • {roster.length} người</p>
        </div>
      </div>

      {/* Top Center HUD: Status and Timer */}
      <div className="call-1v1-top-center">
        <Signal size={16} color="#22c55e" />
        <span aria-label="Thời lượng cuộc gọi">
          {now && formatDuration(connectedAt)}
        </span>
        <ShieldCheck size={18} color="#22c55e" />
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)' }} />
        <Settings size={18} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setDebugOpen(!debugOpen)} />
      </div>

      {/* Top Right HUD: Grid and More */}
      <div className="call-1v1-top-right" style={{ gap: 12 }}>
        <LayoutGrid size={18} style={{ cursor: 'pointer' }} />
        <MoreVertical size={18} style={{ cursor: 'pointer' }} onClick={() => setMorePanelOpen((open) => !open)} />
      </div>

      {(isScreenSharing || isRecording) && (
        <div className="call-hud-stack">
          {isScreenSharing && (
            <div className="hud-pill hud-pill--share">
              <MonitorUp size={16} />
              Sharing screen
            </div>
          )}
          {isRecording && (
            <div className="hud-pill hud-pill--recording" role="status">
              <Radio size={15} />
              Recording {formatDuration(recordingStartedAt || recordingNow)}
            </div>
          )}
        </div>
      )}

      {/* Video Grid */}
      {isScreenSharing ? (
        <section className="presentation-layout">
          <div className="presentation-main">
            <ParticipantTile
              username={selfId ?? ""}
              isSelf={true}
              stream={getRoomLocalStream()}
              streamVersion={localStreamVersion + selfVideoVersion.current}
              micMuted={micMuted}
              camOff={camOff}
              connectionState={'connected'}
              isScreenSharing={true}
            />
          </div>
          <div className="presentation-sidebar">
            <div className="presentation-speaker">
              <ParticipantTile
                username={selfId ?? ""}
                isSelf={true}
                stream={getRoomLocalStream()}
                streamVersion={localStreamVersion + selfVideoVersion.current}
                micMuted={micMuted}
                camOff={true}
                connectionState={'connected'}
              />
              <div className="speaker-badge">Người đang nói</div>
            </div>
            <div className="presentation-thumbnails">
              {remoteMembers.map((member) => (
                <div key={member.username} className="presentation-thumbnail-wrapper">
                  <ParticipantTile
                    username={member.username}
                    isSelf={false}
                    stream={getRoomRemoteStream(member.username)}
                    streamVersion={member.streamVersion}
                    micMuted={member.micMuted}
                    camOff={member.camOff}
                    connectionState={member.connectionState}
                    sinkId={selectedSpeakerDeviceId}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section style={{ position: 'absolute', inset: '80px 24px 140px', display: 'grid', gap: 16, padding: 0, ...gridStyle(roster.length), transition: 'grid-template-columns 0.2s ease' }}>
          {tiles}
        </section>
      )}

      {alone && (
        <div className="call-reconnect" role="status" aria-live="polite">
          <span>Tất cả đã rời phòng</span>
        </div>
      )}

      {/* Bottom Center HUD: Main Controls */}
      <footer className="call-1v1-bottom-bar">
        <LabeledMuteButton muted={micMuted} onClick={toggleRoomMic} />
        <LabeledCamButton off={camOff} onClick={toggleRoomCam} />
        <LabeledShareButton
          onClick={toggleShare}
          active={isScreenSharing}
          loading={shareLoading}
          disabled={!canRoomScreenShare()}
          title={!canRoomScreenShare() ? 'Screen sharing is unavailable in this browser.' : undefined}
        />
        <LabeledRecordButton onClick={() => isRecording ? void stopRecording() : startRecording()} active={isRecording} />
        <LabeledMoreButton onClick={() => setMorePanelOpen((open) => !open)} active={morePanelOpen} />
        <LabeledHangUpButton onClick={leaveRoom} />
      </footer>

      <MorePanel 
        open={morePanelOpen} 
        onClose={() => setMorePanelOpen(false)} 
        mode="group" 
      />

      <RecordingPreviewModal
        open={hasRecordingPreview && Boolean(recordingPreview?.url)}
        previewUrl={recordingPreview?.url ?? null}
        mimeType={recordingPreview?.mimeType ?? "video/webm"}
        durationMs={recordingPreview?.durationMs ?? 0}
        downloadName={`group-call-${roomId ?? "recording"}-${Date.now()}.webm`}
        onClose={closeRecordingPreview}
      />

      {debugOpen && (
        <div style={{ position: 'absolute', top: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
          <DebugPanel peers={peerDebug} />
        </div>
      )}
    </main>
  )
}
