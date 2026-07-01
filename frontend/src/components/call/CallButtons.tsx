import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, X, MonitorUp, Users, MoreHorizontal, ChevronDown, Circle } from "lucide-react"

type BtnProps = { onClick: () => void; disabled?: boolean }
type LabeledToolButtonProps = BtnProps & {
  active?: boolean
  loading?: boolean
  title?: string
}

export function MuteButton({ muted, onClick }: { muted: boolean; onClick: () => void }) {
  return (
    <button className={`call-round-btn-new ${muted ? "muted" : ""}`} onClick={onClick} aria-label={muted ? "Bật mic" : "Tắt mic"} type="button">
      {muted ? <MicOff size={24} /> : <Mic size={24} />}
    </button>
  )
}

export function CamToggleButton({ off, onClick }: { off: boolean; onClick: () => void }) {
  return (
    <button className={`call-round-btn-new ${off ? "muted" : ""}`} onClick={onClick} aria-label={off ? "Bật camera" : "Tắt camera"} type="button">
      {off ? <VideoOff size={24} /> : <Video size={24} />}
    </button>
  )
}

export function ShareScreenButton({ onClick }: BtnProps) {
  return (
    <button className="call-round-btn-new" onClick={onClick} aria-label="Chia sẻ màn hình" type="button">
      <MonitorUp size={24} />
    </button>
  )
}

export function ParticipantsButton({ onClick }: BtnProps) {
  return (
    <button className="call-round-btn-new" onClick={onClick} aria-label="Người tham gia" type="button">
      <Users size={24} />
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
    <button className="call-round-btn-new danger" onClick={onClick} aria-label="Kết thúc cuộc gọi" type="button">
      <PhoneOff size={24} />
    </button>
  )
}

export function LeaveRoomButton({ onClick }: BtnProps) {
  return (
    <button className="call-round-btn-new danger" onClick={onClick} aria-label="Rời phòng" type="button">
      <PhoneOff size={24} />
    </button>
  )
}

export function LabeledMuteButton({ muted, onClick }: { muted: boolean; onClick: () => void }) {
  return (
    <button className={`call-labeled-btn ${muted ? "muted" : ""}`} onClick={onClick} type="button" title={muted ? "Bật mic" : "Tắt mic"}>
      <div className="call-labeled-btn-icon">
        {muted ? <MicOff size={22} /> : <Mic size={22} />}
      </div>
      <span className="call-labeled-btn-text" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {muted ? "Bật tiếng" : "Tắt tiếng"} <ChevronDown size={14} />
      </span>
    </button>
  )
}

export function LabeledCamButton({ off, onClick }: { off: boolean; onClick: () => void }) {
  return (
    <button className={`call-labeled-btn ${off ? "muted" : ""}`} onClick={onClick} type="button" title={off ? "Bật camera" : "Tắt camera"}>
      <div className="call-labeled-btn-icon">
        {off ? <VideoOff size={22} /> : <Video size={22} />}
      </div>
      <span className="call-labeled-btn-text" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        Camera <ChevronDown size={14} />
      </span>
    </button>
  )
}

export function LabeledShareButton({ onClick, active = false, loading = false, disabled = false, title }: LabeledToolButtonProps) {
  return (
    <button
      className={`call-labeled-btn ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
      title={title ?? "Chia sẻ màn hình"}
      disabled={disabled || loading}
      aria-pressed={active}
      aria-busy={loading || undefined}
    >
      <div className="call-labeled-btn-icon">
        <MonitorUp size={22} />
      </div>
      <span className="call-labeled-btn-text">{loading ? "Starting..." : "Chia sẻ"}</span>
    </button>
  )
}

export function LabeledMoreButton({ onClick, active = false, loading = false, disabled = false }: LabeledToolButtonProps) {
  return (
    <button
      className={`call-labeled-btn ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
      title="Thêm tùy chọn"
      disabled={disabled || loading}
      aria-pressed={active}
      aria-busy={loading || undefined}
    >
      <div className="call-labeled-btn-icon">
        <MoreHorizontal size={22} />
      </div>
      <span className="call-labeled-btn-text" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {loading ? "Starting..." : "Thêm"} <ChevronDown size={14} />
      </span>
    </button>
  )
}

export function LabeledRecordButton({ onClick, active = false }: { onClick: () => void, active?: boolean }) {
  return (
    <button
      className={`call-labeled-btn ${active ? "recording" : ""}`}
      onClick={onClick}
      type="button"
      title="Ghi hình"
      aria-pressed={active}
    >
      <div className="call-labeled-btn-icon">
        <Circle size={22} strokeWidth={2.5} color={active ? "#ef4444" : "currentColor"} fill={active ? "#ef4444" : "transparent"} />
      </div>
      <span className="call-labeled-btn-text">Ghi hình</span>
    </button>
  )
}

export function LabeledParticipantsButton({ onClick }: BtnProps) {
  return (
    <button className="call-labeled-btn" onClick={onClick} type="button" title="Danh sách người tham gia">
      <div className="call-labeled-btn-icon">
        <Users size={22} />
      </div>
      <span className="call-labeled-btn-text">Người tham gia</span>
    </button>
  )
}

export function LabeledHangUpButton({ onClick }: BtnProps) {
  return (
    <button className="call-labeled-btn danger" onClick={onClick} type="button" title="Kết thúc cuộc gọi / Rời phòng">
      <div className="call-labeled-btn-icon">
        <PhoneOff size={22} />
      </div>
      <span className="call-labeled-btn-text">Kết thúc</span>
    </button>
  )
}
