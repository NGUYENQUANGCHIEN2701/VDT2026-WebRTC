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
  /** Task 3 (Wave 4): pass from CallPage so the panel can gate Start recording */
  remoteStreamReady?: boolean
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
  remoteStreamReady = false,
}: MorePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [now, setNow] = useState(Date.now())
  // Task 3: per-selector switching spinners to give feedback without dropping call
  const [switchingCamera, setSwitchingCamera] = useState(false)
  const [switchingMicrophone, setSwitchingMicrophone] = useState(false)

  const call = useCallStore()
  const room = useRoomStore()
  const state = mode === "1-1" ? call : room

  // Task 3: unsupported-browser guards
  const recorderSupported = typeof MediaRecorder !== "undefined"
  // Task 1: speaker entirely hidden (not disabled) when setSinkId unsupported (D-10)
  const supportsSinkId =
    typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype

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

  // Task 3: Start recording disabled when:
  //   a) MediaRecorder unsupported in this browser
  //   b) remote stream not yet ready (call not media-connected)
  //   c) caller explicitly sets recordingDisabled
  const startDisabled = recordingDisabled || !recorderSupported || !remoteStreamReady

  // Task 3: helper text follows UI-SPEC priority order
  let recordingHelperText: string | null = null
  if (!recorderSupported) {
    recordingHelperText = "Recording is not supported in this browser. The call can continue."
  } else if (!remoteStreamReady) {
    recordingHelperText = "Recording starts after the call media is connected."
  } else if (recordingDisabled) {
    recordingHelperText = "Recording is unavailable."
  }

  const onCameraChange = async (deviceId: string) => {
    setSwitchingCamera(true)
    try {
      if (mode === "1-1") await switchCamera(deviceId)
      else await switchRoomCamera(deviceId)
    } finally {
      setSwitchingCamera(false)
    }
  }
  const onMicrophoneChange = async (deviceId: string) => {
    setSwitchingMicrophone(true)
    try {
      if (mode === "1-1") await switchMicrophone(deviceId)
      else await switchRoomMicrophone(deviceId)
    } finally {
      setSwitchingMicrophone(false)
    }
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
        {/* Task 3: disable selector while switching to prevent double-switch */}
        <select
          className="more-panel-select"
          value={selectedCamera}
          disabled={switchingCamera}
          onChange={(event) => { void onCameraChange(event.target.value) }}
          aria-busy={switchingCamera}
        >
          <option value="">Default camera</option>
          {cameras.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {labelFor(device, "Camera", index)}
            </option>
          ))}
        </select>
        {state.isScreenSharing && <p className="more-panel-note">Applies after sharing stops.</p>}
        {switchingCamera && <p className="more-panel-note">Switching camera…</p>}
      </section>

      <section className="more-panel-section">
        <h3><Mic size={16} /> Microphone</h3>
        {/* Task 3: disable selector while switching */}
        <select
          className="more-panel-select"
          value={selectedMicrophone}
          disabled={switchingMicrophone}
          onChange={(event) => { void onMicrophoneChange(event.target.value) }}
          aria-busy={switchingMicrophone}
        >
          <option value="">Default microphone</option>
          {microphones.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {labelFor(device, "Microphone", index)}
            </option>
          ))}
        </select>
        {state.micMuted && <p className="more-panel-note">Microphone will stay muted.</p>}
        {switchingMicrophone && <p className="more-panel-note">Switching microphone…</p>}
      </section>

      {/* Task 3: speaker entirely hidden (not disabled) when setSinkId unsupported — D-10 */}
      {supportsSinkId && (
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
              <button
                className="app-button"
                type="button"
                onClick={onStartRecording}
                disabled={startDisabled}
                aria-disabled={startDisabled}
              >
                <Download size={16} />
                Start recording
              </button>
              {/* Task 3: helper text per UI-SPEC */}
              {recordingHelperText && (
                <p className="more-panel-note">{recordingHelperText}</p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
