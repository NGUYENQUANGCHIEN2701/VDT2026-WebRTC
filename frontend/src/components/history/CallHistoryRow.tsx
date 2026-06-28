import type { HistoryRow } from '../../api/history'

// glyph theo HƯỚNG (D-06): caller↗, callee đến↙, nhỡ↘(đỏ)
const GLYPH: Record<string, string> = { OUTGOING: '↗', INCOMING: '↙', MISSED: '↘' }
const GLYPH_COLOR: Record<string, string> = { OUTGOING: 'var(--text)', INCOMING: 'var(--text)', MISSED: '#dc2626' }

// nhãn per-side: cùng 1 cuộc, mỗi bên thấy chữ khác nhau (D-06) — UI-SPEC §Copywriting
function outcomeLabel(direction: string, endReason: string): string {
    switch (endReason) {
        case 'completed': return direction === 'OUTGOING' ? 'Gọi đi' : 'Cuộc gọi đến'
        case 'missed': return direction === 'MISSED' ? 'Cuộc gọi nhỡ' : 'Gọi đi không trả lời'
        case 'rejected': return direction === 'OUTGOING' ? 'Bị từ chối' : 'Đã từ chối'
        case 'cancelled': return 'Đã hủy'
        case 'dropped': return 'Mất kết nối'
        default: return endReason
    }
}

function labelColor(direction: string, endReason: string): string {
    if (endReason === 'missed' && direction === 'MISSED') return '#dc2626' // nhỡ: đỏ
    if (endReason === 'dropped') return '#d97706'                          // mất kết nối: hổ phách
    return 'var(--text)'
}

function fmtDuration(ms: number | null): string {
    if (ms == null) return '—'
    const sec = Math.floor(ms / 1000)
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function CallHistoryRow({ row }: { row: HistoryRow }) {
    return (
        <li style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', listStyle: 'none' }}>
            <span aria-hidden="true" style={{ fontSize: 18, color: GLYPH_COLOR[row.direction] ?? 'var(--text)' }}>
                {GLYPH[row.direction] ?? '•'}
            </span>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: 'var(--text-h)', textAlign: 'left' }}>{row.peerId}</span>
            <span style={{ fontSize: 14, color: labelColor(row.direction, row.endReason) }}>{outcomeLabel(row.direction, row.endReason)}</span>
            <span style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', color: 'var(--text)', minWidth: 48, textAlign: 'right' }}>{fmtDuration(row.durationMs)}</span>
            <span style={{ fontSize: 14, color: 'var(--text)', opacity: 0.6 }}>{fmtTime(row.endedAt)}</span>
        </li>
    )
}
