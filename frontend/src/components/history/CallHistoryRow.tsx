import { ArrowDownLeft, ArrowUpRight, PhoneMissed } from "lucide-react"
import type { HistoryRow } from "../../api/history"

function outcomeLabel(direction: string, endReason: string): string {
  switch (endReason) {
    case "completed": return direction === "OUTGOING" ? "Gọi đi" : "Cuộc gọi đến"
    case "missed": return direction === "MISSED" ? "Cuộc gọi nhỡ" : "Gọi đi không trả lời"
    case "rejected": return direction === "OUTGOING" ? "Bị từ chối" : "Đã từ chối"
    case "cancelled": return "Đã hủy"
    case "dropped": return "Mất kết nối"
    default: return endReason
  }
}

function labelClass(direction: string, endReason: string): string {
  if (endReason === "missed" && direction === "MISSED") return "history-state history-state--danger"
  if (endReason === "dropped") return "history-state history-state--warning"
  return "history-state"
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—"
  const sec = Math.floor(ms / 1000)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "OUTGOING") return <ArrowUpRight size={18} />
  if (direction === "INCOMING") return <ArrowDownLeft size={18} />
  return <PhoneMissed size={18} />
}

export default function CallHistoryRow({ row }: { row: HistoryRow }) {
  return (
    <li className="history-row">
      <span className={`history-icon ${row.direction === "MISSED" ? "history-icon--danger" : ""}`} aria-hidden="true">
        <DirectionIcon direction={row.direction} />
      </span>
      <span className="history-peer">{row.peerId}</span>
      <span className={labelClass(row.direction, row.endReason)}>{outcomeLabel(row.direction, row.endReason)}</span>
      <span className="history-duration">{fmtDuration(row.durationMs)}</span>
      <span className="history-time">{fmtTime(row.endedAt)}</span>
    </li>
  )
}
