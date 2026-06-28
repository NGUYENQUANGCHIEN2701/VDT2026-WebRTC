import type { HistoryRow } from '../../api/history'
import CallHistoryRow from './CallHistoryRow'

export default function DayGroup({ label, rows }: { label: string; rows: HistoryRow[] }) {
    return (
        <section>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid var(--border)', padding: '8px 16px', position: 'sticky', top: 0, background: 'var(--bg)' }}>
                {label}
            </div>
            <ul style={{ margin: 0, padding: 0 }}>
                {rows.map((r) => <CallHistoryRow key={r.callId} row={r} />)}
            </ul>
        </section>
    )
}
