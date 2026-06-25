import { Fragment } from 'react'
import type { StatsSample } from '../../webrtc/stats'

const iceColor = (t: string | null) => (t === 'relay' ? '#dc2626' : t === 'srflx' ? '#d97706' : 'var(--text)')
const mono = { fontFamily: 'var(--mono)', fontSize: 14 } as const

// Nút bật/tắt panel (đặt ở top bar CallPage)
export function DebugToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Bảng debug (ẩn/hiện)" aria-expanded={open}
      style={{
        width: 44, height: 44, background: 'transparent', borderRadius: 4, cursor: 'pointer',
        border: `1px solid ${open ? 'var(--accent-border)' : 'var(--border)'}`,
        color: open ? 'var(--accent)' : 'var(--text)',
      }}>
      ⚙
    </button>
  )
}

export default function DebugPanel({ stats }: { stats: StatsSample | null }) {
  const dash = '—'
  const rows: [string, React.ReactNode][] = [
    ['Codec', stats?.codec ?? dash],
    ['Bitrate', stats?.bitrateKbps != null ? `${stats.bitrateKbps} kbps` : dash],
    ['Độ phân giải', stats?.resolution ?? dash],
    ['ICE', <span style={{ color: iceColor(stats?.candidateType ?? null) }}>{stats?.candidateType ?? dash}</span>],
    ['RTT', stats?.rttMs != null ? `${Math.round(stats.rttMs)} ms` : dash],
    ['Mất gói', stats?.packetLoss != null ? `${(stats.packetLoss * 100).toFixed(1)}%` : dash],
  ]
  return (
    <div style={{ background: 'var(--code-bg)', borderTop: '1px solid var(--border)', padding: '8px 16px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px' }}>
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
          <span style={mono}>{value}</span>
        </Fragment>
      ))}
    </div>
  )
}
