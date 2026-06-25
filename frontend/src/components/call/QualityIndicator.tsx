import type { CallState } from '../../store/callStore'
import type { StatsSample } from '../../webrtc/stats'

const ICE: Partial<Record<CallState, { color: string; text: string }>> = {
    connecting: { color: '#6b7280', text: 'Đang kết nối…' },
    connected: { color: '#16a34a', text: 'Đã kết nối' },
    reconnecting: { color: '#dc2626', text: 'Đang kết nối lại…' },
    failed: { color: '#dc2626', text: 'Kết nối thất bại' },
}

// Ngưỡng màu theo UI-SPEC
const rttColor = (ms: number) => (ms <= 100 ? 'var(--text)' : ms <= 300 ? '#d97706' : '#dc2626')
const lossColor = (pct: number) => (pct <= 2 ? 'var(--text)' : pct <= 10 ? '#d97706' : '#dc2626')

export default function QualityIndicator({ callState, stats }: { callState: CallState; stats: StatsSample | null }) {
    const ice = ICE[callState] ?? { color: '#6b7280', text: '' }
    const rtt = stats?.rttMs ?? null
    const lossPct = stats?.packetLoss != null ? stats.packetLoss * 100 : null

    return (
        <div role="status" aria-live="polite" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: ice.color }} />
            <span style={{ color: ice.color }}>{ice.text}</span>
            <span style={{ fontWeight: 400, color: rtt != null ? rttColor(rtt) : 'var(--text)' }}>
                RTT: {rtt != null ? `${Math.round(rtt)}ms` : '—'}
            </span>
            <span style={{ fontWeight: 400, color: lossPct != null ? lossColor(lossPct) : 'var(--text)' }}>
                Mất gói: {lossPct != null ? `${lossPct.toFixed(1)}%` : '—'}
            </span>
        </div>
    )
}
