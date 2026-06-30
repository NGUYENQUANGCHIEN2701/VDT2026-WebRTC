import { ArrowDownLeft, ArrowUpRight } from "lucide-react"
import type { HistoryRow } from "../../api/history"

function outcomeLabel(direction: string, endReason: string): string {
  switch (endReason) {
    case "completed": return direction === "OUTGOING" ? "Gọi đi" : "Cuộc gọi đến"
    case "missed": return direction === "MISSED" ? "Cuộc gọi nhỡ" : "Không trả lời"
    case "rejected": return direction === "OUTGOING" ? "Bị từ chối" : "Đã từ chối"
    case "cancelled": return "Đã hủy"
    case "dropped": return "Mất kết nối"
    default: return endReason
  }
}

function labelClass(direction: string, endReason: string): string {
  let state = "cancelled"
  if (endReason === "completed") {
    state = direction === "OUTGOING" ? "outgoing" : "incoming"
  } else if (endReason === "rejected" || endReason === "missed") {
    state = "rejected"
  } else if (endReason === "dropped") {
    state = "dropped"
  }
  return `history-state history-state--${state}`
}

function iconClass(direction: string, endReason: string): string {
  if (endReason === "completed" && direction === "INCOMING") return "history-icon--incoming"
  if (endReason === "rejected" || endReason === "missed" || direction === "MISSED") return "history-icon--missed"
  return "history-icon--outgoing"
}

function fmtDuration(ms: number | null): string {
  if (ms == null || ms === 0) return "—"
  const sec = Math.floor(ms / 1000)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })
}

function DirectionIcon({ direction, endReason }: { direction: string, endReason: string }) {
  if (endReason === "rejected" || endReason === "missed" || direction === "MISSED" || direction === "INCOMING") {
    return <ArrowDownLeft size={18} />
  }
  return <ArrowUpRight size={18} />
}

export default function CallHistoryRow({ row }: { row: HistoryRow }) {
  return (
    <div className="history-row">
      <div className={`history-icon ${iconClass(row.direction, row.endReason)}`} aria-hidden="true">
        <DirectionIcon direction={row.direction} endReason={row.endReason} />
      </div>
      <div className="history-peer">{row.peerId}</div>
      <div className={labelClass(row.direction, row.endReason)}>{outcomeLabel(row.direction, row.endReason)}</div>
      <div className="history-duration">{fmtDuration(row.durationMs)}</div>
      <div className="history-time">{fmtTime(row.endedAt)}</div>
    </div>
  )
}
