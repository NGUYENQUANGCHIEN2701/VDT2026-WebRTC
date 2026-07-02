import { useEffect, useMemo, useRef, useState } from "react"
import { Video, Mic, MonitorSpeaker, X, Play } from "lucide-react"
import { useCallStore } from "../../store/callStore"
import { useRoomStore } from "../../store/roomStore"
import { switchCamera, switchMicrophone, getLocalStream as getLocalCallStream } from "../../realtime/callActions"
import { setRoomSinkId, switchRoomCamera, switchRoomMicrophone, getRoomLocalStream as getLocalRoomStream } from "../../realtime/roomActions"
import { enumerateMediaDevices } from "../../webrtc/mediaDevices"
import "./MorePanelStyles.css"

interface MorePanelProps {
  open: boolean
  onClose: () => void
  mode: "1-1" | "group"
}

function labelFor(device: MediaDeviceInfo, fallback: string, index: number): string {
  return device.label || `${fallback} ${index + 1}`
}

export default function MorePanel({
  open,
  onClose,
  mode,
}: MorePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [switchingCamera, setSwitchingCamera] = useState(false)
  const [switchingMicrophone, setSwitchingMicrophone] = useState(false)

  const call = useCallStore()
  const room = useRoomStore()
  const state = mode === "1-1" ? call : room
  const localStream = mode === "1-1" ? getLocalCallStream() : getLocalRoomStream()

  const supportsSinkId = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype

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
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream, state.selectedCameraDeviceId, open])

  if (!open) return null

  const selectedCamera = state.selectedCameraDeviceId ?? ""
  const selectedMicrophone = state.selectedMicrophoneDeviceId ?? ""
  const selectedSpeaker = state.selectedSpeakerDeviceId ?? ""


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

  const handleTestSound = () => {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  };


  return (
    <div className="mp-panel" ref={panelRef} role="dialog" aria-modal="false" aria-label="Cài đặt thiết bị">
      <header className="mp-header">
        <div>
          <h2>Cài đặt cuộc gọi</h2>
          <p>Chọn thiết bị sẽ dùng cho cuộc gọi.</p>
        </div>
        <button className="mp-close" type="button" onClick={onClose} aria-label="Đóng">
          <X size={20} />
        </button>
      </header>

      <div className="mp-content">
        <section className="mp-section">
          <h3><Video size={16} /> Camera</h3>
          <select
            className="mp-select"
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
          <div className="mp-video-preview">
             <video ref={videoRef} autoPlay muted playsInline />
          </div>
          {state.isScreenSharing && <p className="mp-note">Áp dụng sau khi dừng chia sẻ màn hình.</p>}
          {switchingCamera && <p className="mp-note">Đang chuyển camera…</p>}
        </section>

        <section className="mp-section">
          <h3><Mic size={16} /> Microphone</h3>
          <select
            className="mp-select"
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
          <div className="mp-audio-level">
             {Array.from({length: 30}).map((_, i) => (
                 <div key={i} className="mp-audio-bar" style={{ animationDelay: `${i * 0.05}s` }}></div>
             ))}
          </div>
          {state.micMuted && <p className="mp-note">Microphone sẽ giữ trạng thái tắt.</p>}
          {switchingMicrophone && <p className="mp-note">Đang chuyển microphone…</p>}
        </section>

        {supportsSinkId && (
          <section className="mp-section">
            <h3><MonitorSpeaker size={16} /> Speaker</h3>
            <select className="mp-select" value={selectedSpeaker} onChange={(event) => onSpeakerChange(event.target.value)}>
              <option value="">Default speaker</option>
              {speakers.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  {labelFor(device, "Speaker", index)}
                </option>
              ))}
            </select>
            <div className="mp-test-sound">
              <span>Kiểm tra âm thanh</span>
              <button className="mp-test-btn" onClick={handleTestSound}>
                <Play size={14} fill="currentColor" />
              </button>
            </div>
          </section>
        )}
      </div>

      <div className="mp-footer">
        <button className="mp-done-btn" onClick={onClose}>Xong</button>
      </div>
    </div>
  )
}
