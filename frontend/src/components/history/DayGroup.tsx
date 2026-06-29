import type { HistoryRow } from "../../api/history"
import CallHistoryRow from "./CallHistoryRow"

export default function DayGroup({ label, rows }: { label: string; rows: HistoryRow[] }) {
  return (
    <section className="history-day">
      <div className="history-day-label">{label}</div>
      <ul className="app-list">
        {rows.map((r) => <CallHistoryRow key={r.callId} row={r} />)}
      </ul>
    </section>
  )
}
