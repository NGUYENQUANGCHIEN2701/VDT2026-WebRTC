import { Calendar } from "lucide-react"
import type { HistoryRow } from "../../api/history"
import CallHistoryRow from "./CallHistoryRow"

export default function DayGroup({ label, rows }: { label: string; rows: HistoryRow[] }) {
  return (
    <section className="history-day">
      <div className="history-day-label">
        <Calendar size={16} color="#3b82f6" />
        {label}
      </div>
      <div className="app-list">
        {rows.map((r) => <CallHistoryRow key={r.callId} row={r} />)}
      </div>
    </section>
  )
}
