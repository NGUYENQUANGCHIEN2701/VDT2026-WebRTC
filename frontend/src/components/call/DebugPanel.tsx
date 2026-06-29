import { Fragment } from 'react'
import { Settings } from 'lucide-react'
import type { StatsSample } from '../../webrtc/stats'

const iceColor = (t: string | null) => (t === 'relay' ? '#dc2626' : t === 'srflx' ? '#d97706' : 'var(--text)')
const mono = { fontFamily: 'var(--mono)', fontSize: 14 } as const

// Nút bật/tắt panel (đặt ở top bar CallPage)
export function DebugToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Bảng debug (ẩn/hiện)" aria-expanded={open}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, background: open ? 'var(--accent-bg)' : 'transparent',
        borderRadius: '50%', cursor: 'pointer', border: 'none',
        color: open ? 'var(--accent)' : 'var(--text)',
        transition: 'all 0.2s ease',
      }}>
      <Settings size={18} />
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
    <div style={{
      position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
      background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.14)', borderRadius: 12, padding: '16px 20px',
      display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 24px',
      boxShadow: '0 16px 45px rgba(0, 0, 0, 0.22)'
    }}>
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
          <span style={mono}>{value}</span>
        </Fragment>
      ))}
    </div>
  )
}
