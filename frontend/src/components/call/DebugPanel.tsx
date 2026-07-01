import { Settings, Activity, FileCode, BarChart2, Monitor, Globe, Clock, Wifi, Gauge } from 'lucide-react'
import type { StatsSample } from '../../webrtc/stats'
import './DebugPanelStyles.css'

export function DebugToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Bảng debug ẩn hiện" aria-expanded={open}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, background: open ? 'rgba(255,255,255,0.1)' : 'transparent',
        borderRadius: '50%', cursor: 'pointer', border: 'none',
        color: open ? '#fff' : 'rgba(255,255,255,0.7)',
        transition: 'all 0.2s ease',
      }}>
      <Settings size={18} />
    </button>
  )
}

export interface PeerDebugStats {
  peerId: string
  stats: StatsSample | null
  maxBitrateKbps?: number | null
}

function getRttBadge(rtt?: number | null) {
  if (rtt == null) return null;
  if (rtt < 100) return <span className="dp-badge success">Tốt</span>;
  if (rtt < 300) return <span className="dp-badge warning">Khá</span>;
  return <span className="dp-badge danger">Kém</span>;
}

function getBitrateBadge(kbps?: number | null) {
  if (kbps == null) return null;
  if (kbps > 500) return <span className="dp-badge success">Tốt</span>;
  if (kbps > 100) return <span className="dp-badge warning">Khá</span>;
  return <span className="dp-badge danger">Kém</span>;
}

function getLossBadge(loss?: number | null) {
  if (loss == null) return null;
  if (loss < 0.02) return <span className="dp-badge success">Tốt</span>;
  if (loss < 0.05) return <span className="dp-badge warning">Khá</span>;
  return <span className="dp-badge danger">Kém</span>;
}

function renderRows(stats: StatsSample | null, maxBitrateKbps?: number | null) {
  const dash = '-'
  return (
    <>
      <div className="dp-row">
        <div className="dp-icon-label"><FileCode size={16} /> Codec</div>
        <div className="dp-value">{stats?.codec ?? dash}</div>
      </div>
      <div className="dp-row">
        <div className="dp-icon-label"><BarChart2 size={16} /> Bitrate</div>
        <div className="dp-value">
          {stats?.bitrateKbps != null ? `${stats.bitrateKbps} kbps` : dash}
          {getBitrateBadge(stats?.bitrateKbps)}
        </div>
      </div>
      <div className="dp-row">
        <div className="dp-icon-label"><Monitor size={16} /> Độ phân giải</div>
        <div className="dp-value">{stats?.resolution ?? dash}</div>
      </div>
      <div className="dp-row">
        <div className="dp-icon-label"><Globe size={16} /> ICE</div>
        <div className="dp-value">{stats?.candidateType ?? dash}</div>
      </div>
      <div className="dp-row">
        <div className="dp-icon-label"><Clock size={16} /> RTT</div>
        <div className="dp-value">
          {stats?.rttMs != null ? `${Math.round(stats.rttMs)} ms` : dash}
          {getRttBadge(stats?.rttMs)}
        </div>
      </div>
      <div className="dp-row">
        <div className="dp-icon-label"><Wifi size={16} /> Mất gói</div>
        <div className="dp-value">
          {stats?.packetLoss != null ? `${(stats.packetLoss * 100).toFixed(1)}%` : dash}
          {getLossBadge(stats?.packetLoss)}
        </div>
      </div>
      <div className="dp-row">
        <div className="dp-icon-label"><Gauge size={16} /> maxBitrate</div>
        <div className="dp-value">{maxBitrateKbps != null ? `${maxBitrateKbps} kbps` : dash}</div>
      </div>
    </>
  )
}

export default function DebugPanel({ stats, peers }: { stats?: StatsSample | null; peers?: PeerDebugStats[] }) {
  const sections = peers?.length
    ? peers
    : [{ peerId: '', stats: stats ?? null, maxBitrateKbps: null }]
  
  // Show only first for now to match 1-1 style mockup, or wrap them if multiple
  const section = sections[0];

  return (
    <div className="dp-panel">
      <div className="dp-header">
        <Activity size={24} className="dp-header-icon" />
        <div className="dp-header-text">
           <h3>Thông tin kết nối</h3>
           <p>Chất lượng cuộc gọi của bạn</p>
        </div>
      </div>

      <div className="dp-body">
        {section.peerId && <strong style={{color: '#fff', fontSize: 13, padding: '8px 0'}}>{section.peerId}</strong>}
        {renderRows(section.stats, section.maxBitrateKbps)}
      </div>

      <div className="dp-footer">
        <Wifi size={20} className="dp-footer-icon" />
        <div className="dp-footer-text">
           <h4>Kết nối ổn định</h4>
           <p>Chất lượng cuộc gọi đang rất tốt.</p>
        </div>
      </div>
    </div>
  )
}
