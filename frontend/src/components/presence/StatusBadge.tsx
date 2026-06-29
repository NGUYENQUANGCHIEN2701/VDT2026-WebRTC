import type { PresenceStatus } from "../../realtime/messages"

const STYLES: Record<PresenceStatus, { className: string; label: string }> = {
  ONLINE: { className: "status-pill--success", label: "Trực tuyến" },
  IN_CALL: { className: "status-pill--warning", label: "Đang gọi" },
}

export default function StatusBadge({ status }: { status: PresenceStatus }) {
  const s = STYLES[status]
  return <span className={`status-pill ${s.className}`}>{s.label}</span>
}
