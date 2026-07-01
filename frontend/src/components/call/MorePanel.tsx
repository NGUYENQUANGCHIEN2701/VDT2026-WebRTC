import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Mic, MonitorSpeaker, Radio, Video } from "lucide-react"
import { useCallStore } from "../../store/callStore"
import { useRoomStore } from "../../store/roomStore"
import { switchCamera, switchMicrophone } from "../../realtime/callActions"
import { setRoomSinkId, switchRoomCamera, switchRoomMicrophone } from "../../realtime/roomActions"
import { enumerateMediaDevices } from "../../webrtc/mediaDevices"

interface MorePanelProps {
  open: boolean
  onClose: () => void
  mode: "1-1" | "group"
  onStartRecording?: () => void
  onStopRecording?: () => void
  recordingDisabled?: boolean
}

function formatElapsed(startedAt: number | null): string {
  if (!startedAt) return "00:00"
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const minutes = Math.floor(total / 60).toString().padStart(2, "0")
  const seconds = (total % 60).toString().padStart(2, "0")
  return `${minutes}:${seconds}`
}

function labelFor(device: MediaDeviceInfo, fallback: string, index: number): string {
  return device.label || `${fallback} ${index + 1}`
}

export default function MorePanel({
  open,
  onClose,
  mode,
  onStartRecording,
  onStopRecording,
  recordingDisabled = false,
}: MorePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [now, setNow] = useState(Date.now())

  const call = useCallStore()
  const room = useRoomStore()
  const state = mode === "1-1" ? call : room
  const mediaRecorderUnsupported = typeof MediaRecorder === "undefined"
  const canSetSinkId = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype

  const cameras = useMemo(() => devices.filter((device) => device.kind === "videoinput"), [devices])
  const microphones = useMemo(() => devices.filter((device) => device.kind === "audioinput"), [devices])
  const speakers = useMemo(() => devices.filter((device) => device.kind === "audiooutput"), [devices])

  useEffect(() => {
    if (!open) return
    let mounted = true
    const load = async () => {
      try {
        const next = await enumerateMediaDevices()
        if (mounted) setDevices(next)
      } catch {
        if (mounted) setDevices([])
      }
    }
    void load()
    navigator.mediaDevices?.addEventListener?.("devicechange", load)
    return () => {
      mounted = false
      navigator.mediaDevices?.removeEventListener?.("devicechange", load)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [onClose, open])

  useEffect(() => {
    if (!open || mode !== "1-1" || !call.isRecording) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [call.isRecording, mode, open])

  if (!open) return null

  const selectedCamera = state.selectedCameraDeviceId ?? ""
  const selectedMicrophone = state.selectedMicrophoneDeviceId ?? ""
  const selectedSpeaker = state.selectedSpeakerDeviceId ?? ""
  const startDisabled = recordingDisabled || mediaRecorderUnsupported

  const onCameraChange = (deviceId: string) => {
    if (mode === "1-1") void switchCamera(deviceId)
    else void switchRoomCamera(deviceId)
  }
  const onMicrophoneChange = (deviceId: string) => {
    if (mode === "1-1") void switchMicrophone(deviceId)
    else void switchRoomMicrophone(deviceId)
  }
  const onSpeakerChange = (deviceId: string) => {
    if (mode === "1-1") call.setSelectedSpeakerDeviceId(deviceId || null)
    else if (deviceId) void setRoomSinkId(deviceId)
    else room.setSelectedSpeakerDeviceId(null)
  }

  return (
    <div className="more-panel" ref={panelRef} role="dialog" aria-modal="false" aria-label="Media controls">
      <header className="more-panel-header">
        <div>
          <h2>Media controls</h2>
          <p>Choose devices for this call.</p>
        </div>
        <button className="more-panel-close" type="button" onClick={onClose} aria-label="Close media controls">
          Close
        </button>
      </header>

      <section className="more-panel-section">
        <h3><Video size={16} /> Camera</h3>
        <select className="more-panel-select" value={selectedCamera} onChange={(event) => onCameraChange(event.target.value)}>
          <option value="">Default camera</option>
          {cameras.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {labelFor(device, "Camera", index)}
            </option>
          ))}
        </select>
        {state.isScreenSharing && <p className="more-panel-note">Applies after sharing stops.</p>}
      </section>

      <section className="more-panel-section">
        <h3><Mic size={16} /> Microphone</h3>
        <select className="more-panel-select" value={selectedMicrophone} onChange={(event) => onMicrophoneChange(event.target.value)}>
          <option value="">Default microphone</option>
          {microphones.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {labelFor(device, "Microphone", index)}
            </option>
          ))}
        </select>
        {state.micMuted && <p className="more-panel-note">Microphone will stay muted.</p>}
      </section>

      {canSetSinkId && (
        <section className="more-panel-section">
          <h3><MonitorSpeaker size={16} /> Speaker</h3>
          <select className="more-panel-select" value={selectedSpeaker} onChange={(event) => onSpeakerChange(event.target.value)}>
            <option value="">Default speaker</option>
            {speakers.map((device, index) => (
              <option key={device.deviceId || index} value={device.deviceId}>
                {labelFor(device, "Speaker", index)}
              </option>
            ))}
          </select>
        </section>
      )}

      {mode === "1-1" && (
        <section className="more-panel-section">
          <h3><Radio size={16} /> Recording</h3>
          {call.isRecording ? (
            <div className="more-panel-recording-row">
              <span className="more-panel-recording-timer">{formatElapsed(call.recordingStartedAt || now)}</span>
              <button className="app-button app-button--danger" type="button" onClick={onStopRecording}>
                Stop recording
              </button>
            </div>
          ) : (
            <>
              <button className="app-button" type="button" onClick={onStartRecording} disabled={startDisabled}>
                <Download size={16} />
                Start recording
              </button>
              {startDisabled && (
                <p className="more-panel-note">
                  Recording is available after the remote stream starts and your browser supports MediaRecorder.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
