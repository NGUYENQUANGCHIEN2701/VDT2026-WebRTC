import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, X } from "lucide-react"

type BtnProps = { onClick: () => void; disabled?: boolean }

export function MuteButton({ muted, onClick }: { muted: boolean; onClick: () => void }) {
  return (
    <button className={`call-round-button ${muted ? "call-round-button--muted" : ""}`} onClick={onClick} aria-label={muted ? "Bật mic" : "Tắt mic"} type="button">
      {muted ? <MicOff size={22} /> : <Mic size={22} />}
    </button>
  )
}

export function CamToggleButton({ off, onClick }: { off: boolean; onClick: () => void }) {
  return (
    <button className={`call-round-button ${off ? "call-round-button--muted" : ""}`} onClick={onClick} aria-label={off ? "Bật camera" : "Tắt camera"} type="button">
      {off ? <VideoOff size={22} /> : <Video size={22} />}
    </button>
  )
}

export function AcceptButton({ onClick, disabled }: BtnProps) {
  return (
    <button className="app-button app-button--success" onClick={onClick} disabled={disabled} aria-label="Nhận cuộc gọi" type="button">
      <Phone size={17} />
      Nhận
    </button>
  )
}

export function RejectButton({ onClick, disabled }: BtnProps) {
  return (
    <button className="app-button app-button--danger" onClick={onClick} disabled={disabled} aria-label="Từ chối cuộc gọi" type="button">
      <X size={17} />
      Từ chối
    </button>
  )
}

export function CancelButton({ onClick, disabled }: BtnProps) {
  return (
    <button className="app-button app-button--ghost" onClick={onClick} disabled={disabled} aria-label="Hủy cuộc gọi" type="button">
      Hủy cuộc gọi
    </button>
  )
}

export function HangUpButton({ onClick }: BtnProps) {
  return (
    <button className="call-round-button call-round-button--danger" onClick={onClick} aria-label="Kết thúc cuộc gọi" type="button">
      <PhoneOff size={23} />
    </button>
  )
}
