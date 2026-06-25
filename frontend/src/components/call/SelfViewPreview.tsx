import { useEffect, useRef } from 'react'
import type { MediaErrorType } from '../../webrtc/media'
import type { MediaMode } from '../../store/callStore'
import { CancelButton } from './CallButtons'
import MediaErrorNotice from './MediaErrorNotice'
import AudioOnlyBadge from './AudioOnlyBadge'

interface Props {
    remoteUsername: string
    localStream: MediaStream | null
    mediaError: MediaErrorType | null
    mode: MediaMode | null
    onCancel: () => void
}

// Thẻ overlay xem trước camera mình khi đang gọi đi (caller chờ đối phương trả lời).
export default function SelfViewPreview({ remoteUsername, localStream, mediaError, mode, onCancel }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null)

    // MediaStream KHÔNG gán qua JSX được — phải set .srcObject bằng tay qua ref
    useEffect(() => {
        if (videoRef.current && localStream) {
            videoRef.current.srcObject = localStream
        }
    }, [localStream])

    return (
        <div style={{
            position: 'fixed', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)',
        }}>
            <div style={{ maxWidth: 480, width: '100%', background: 'var(--code-bg)', borderRadius: 8, padding: 24, boxShadow: 'var(--shadow)' }}>
                {mediaError ? (
                    <MediaErrorNotice type={mediaError} />
                ) : (
                    <div style={{ position: 'relative' }}>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            aria-label="Camera của bạn"
                            style={{ transform: 'scaleX(-1)', width: '100%', borderRadius: 4, background: '#000' }}
                        />
                        {mode === 'audio-only' && <AudioOnlyBadge />}
                    </div>
                )}
                <p style={{ fontSize: 20, fontWeight: 600, margin: '16px 0 4px', textAlign: 'center' }}>
                    Đang gọi cho {remoteUsername}…
                </p>
                <p style={{ fontSize: 16, margin: '0 0 16px', textAlign: 'center', color: 'var(--text)' }}>
                    Đang chờ đối phương trả lời
                </p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <CancelButton onClick={onCancel} />
                </div>
            </div>
        </div>
    )
}
