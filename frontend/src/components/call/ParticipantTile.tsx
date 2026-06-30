import { useEffect, useRef } from 'react'
import type { PeerConnectionState } from '../../store/roomStore'

interface Props {
  username: string
  stream: MediaStream | null
  streamVersion: number
  isSelf?: boolean
  micMuted?: boolean
  camOff?: boolean
  connectionState: PeerConnectionState
}

function overlayText(state: PeerConnectionState) {
  if (state === 'connecting') return 'Đang kết nối...'
  if (state === 'reconnecting') return 'Đang kết nối lại...'
  if (state === 'failed') return 'Kết nối thất bại'
  return null
}

export default function ParticipantTile({
  username,
  stream,
  streamVersion,
  isSelf = false,
  micMuted = false,
  camOff = false,
  connectionState,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const label = isSelf ? `${username} (bạn)` : username
  const text = overlayText(connectionState)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream, streamVersion])

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 8, background: camOff ? '#1f2937' : '#020617', minHeight: 0 }}>
      {!camOff && (
        <video
          ref={ref}
          autoPlay
          muted={isSelf}
          playsInline
          aria-label={isSelf ? 'Camera của bạn' : `Camera của ${username}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: isSelf ? 'scaleX(-1)' : undefined }}
        />
      )}
      {camOff && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#1f2937' }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: 'var(--code-bg)', color: '#fff', fontSize: 40, fontWeight: 700,
          }}>
            {username.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      {micMuted && (
        <span aria-label={`${username} đã tắt mic`} style={{ position: 'absolute', top: 8, left: 8, fontSize: 14 }}>
          🔇
        </span>
      )}
      <span style={{
        position: 'absolute', left: 8, bottom: 8, padding: '2px 6px', borderRadius: 4,
        color: '#fff', background: 'rgba(0,0,0,0.55)', fontSize: 14, fontWeight: 600,
      }}>
        {label}
      </span>
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
