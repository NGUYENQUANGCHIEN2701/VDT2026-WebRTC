import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useNavigate } from "react-router-dom"
import { CamToggleButton, LeaveRoomButton, MuteButton } from "../components/call/CallButtons"
import DebugPanel, { DebugToggle, type PeerDebugStats } from "../components/call/DebugPanel"
import ParticipantTile from "../components/call/ParticipantTile"
import { getActiveMesh, getRoomLocalStream, getRoomRemoteStream, leaveRoom, toggleRoomCam, toggleRoomMic } from "../realtime/roomActions"
import { useRoomStore } from "../store/roomStore"
import { startStatsPolling, type StatsSample } from "../webrtc/stats"

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
  const [debugOpen, setDebugOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
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
    if (!roomId) navigate("/", { replace: true })
  }, [roomId, navigate])

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

  const tiles = roster.map((member, index) => {
    const isSelf = member.username === selfId
    const isThirdInThree = roster.length === 3 && index === 2
    return (
      <div key={member.username} style={isThirdInThree ? { gridColumn: '1 / -1', justifySelf: 'center', width: '50%', minWidth: 0 } : { minWidth: 0 }}>
        <ParticipantTile
          username={member.username}
          isSelf={isSelf}
          stream={isSelf ? getRoomLocalStream() : getRoomRemoteStream(member.username)}
          streamVersion={isSelf ? selfVideoVersion.current : member.streamVersion}
          micMuted={isSelf ? micMuted : member.micMuted}
          camOff={isSelf ? camOff : member.camOff}
          connectionState={isSelf ? 'connected' : member.connectionState}
        />
      </div>
    )
  })

  return (
    <main className="call-page">
      <header className="call-hud call-hud--top">
        <span
          aria-label={`${roster.length} người trong phòng`}
          style={{ padding: '2px 8px', borderRadius: 4, color: 'var(--text)', background: 'var(--code-bg)', fontSize: 14, fontWeight: 700 }}
        >
          {roster.length} người
        </span>
        <span className="call-duration" aria-label="Thời lượng cuộc gọi">
          {now && formatDuration(connectedAt)}
        </span>
        <DebugToggle open={debugOpen} onClick={() => setDebugOpen((v) => !v)} />
      </header>

      <section style={{ position: 'absolute', inset: '72px 0 88px', display: 'grid', gap: 8, padding: 8, ...gridStyle(roster.length), transition: 'grid-template-columns 0.2s ease' }}>
        {tiles}
      </section>

      {alone && (
        <div className="call-reconnect" role="status" aria-live="polite">
          <span>Tất cả đã rời phòng</span>
        </div>
      )}

      <footer className="call-hud call-controls">
        <MuteButton muted={micMuted} onClick={toggleRoomMic} />
        <CamToggleButton off={camOff} onClick={toggleRoomCam} />
        <LeaveRoomButton onClick={leaveRoom} />
      </footer>

      {debugOpen && <DebugPanel peers={peerDebug} />}
    </main>
  )
}
