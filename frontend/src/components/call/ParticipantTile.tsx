import { useEffect, useRef } from 'react'
import { MoreVertical, MicOff, MonitorUp } from 'lucide-react'
import type { PeerConnectionState } from '../../store/roomStore'

interface Props {
  username: string
  stream: MediaStream | null
  streamVersion: number
  isSelf?: boolean
  micMuted?: boolean
  camOff?: boolean
  connectionState: PeerConnectionState
  sinkId?: string | null
  isScreenSharing?: boolean
}

function overlayText(state: PeerConnectionState) {
  if (state === 'connecting') return 'Đang kết nối...'
  if (state === 'reconnecting') return 'Đang kết nối lại...'
  if (state === 'failed') return 'Kết nối thất bại'
  return null
}

function getAvatarColor(username: string) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e']
  const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[index % colors.length]
}

export default function ParticipantTile({
  username,
  stream,
  streamVersion,
  isSelf = false,
  micMuted = false,
  camOff = false,
  connectionState,
  sinkId = null,
  isScreenSharing = false,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const label = isSelf ? `${username} (Bạn)` : username
  const text = overlayText(connectionState)
  const avatarColor = getAvatarColor(username)
  const initial = username.charAt(0).toUpperCase()

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream, streamVersion, camOff])

  useEffect(() => {
    if (!sinkId || !ref.current || !('setSinkId' in HTMLMediaElement.prototype)) return
    ;(ref.current as HTMLMediaElement & { setSinkId: (sinkId: string) => Promise<void> })
      .setSinkId(sinkId)
      .catch(() => { })
  }, [sinkId])

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, background: camOff ? '#1f2937' : '#020617', minHeight: 0, width: '100%', height: '100%' }}>
      {!camOff && (
        <video
          ref={ref}
          autoPlay
          muted={isSelf}
          playsInline
          aria-label={isSelf ? 'Camera của bạn' : `Camera của ${username}`}
          style={{ width: '100%', height: '100%', objectFit: isScreenSharing ? 'contain' : 'cover', transform: (isSelf && !isScreenSharing) ? 'scaleX(-1)' : undefined }}
        />
      )}
      {camOff && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#1f2937' }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: 'var(--code-bg)', color: '#fff', fontSize: 40, fontWeight: 700,
          }}>
            {initial}
          </div>
        </div>
      )}
      {micMuted && (
        <div aria-label={`${username} đã tắt mic`} style={{ 
          position: 'absolute', top: 12, left: 12, 
          background: '#ef4444', color: 'white',
          padding: 6, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)'
        }}>
          <MicOff size={16} />
        </div>
      )}

      {isScreenSharing && (
        <div className="screen-share-badge" aria-label={`${username} đang chia sẻ màn hình`}>
          <MonitorUp size={14} />
          Màn hình
        </div>
      )}
      
      <div className="participant-label-pill">
        <div className="participant-label-avatar" style={{ background: avatarColor }}>
          {initial}
          <div className="participant-status-dot" />
        </div>
        <span>{label}</span>
      </div>

      <div style={{
        position: 'absolute', top: 12, right: 12, width: 32, height: 32,
        borderRadius: 10, background: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        cursor: 'pointer'
      }}>
        <MoreVertical size={18} />
      </div>

      {text && connectionState !== 'connected' && connectionState !== 'idle' && (
        <div role="status" aria-live="polite" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          color: '#fff', background: connectionState === 'failed' ? 'rgba(31,41,55,0.9)' : 'rgba(0,0,0,0.45)',
          textAlign: 'center', padding: 16,
        }}>
          {connectionState !== 'failed' && <span className="spinner" aria-hidden="true" />}
          <span style={{ fontSize: 14, fontWeight: 600 }}>{text}</span>
          {connectionState === 'failed' && (
            <span style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.7)' }}>
              Đã ngắt kết nối với người này
            </span>
          )}
        </div>
      )}
    </div>
  )
}
