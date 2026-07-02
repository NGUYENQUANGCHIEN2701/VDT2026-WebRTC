import { PhoneOff, SwitchCamera } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { MediaMode } from '../../store/callStore'
import type { MediaErrorType } from '../../webrtc/media'
import AudioOnlyBadge from './AudioOnlyBadge'
import MediaErrorNotice from './MediaErrorNotice'

interface Props {
    remoteUsername: string
    localStream: MediaStream | null
    mediaError: MediaErrorType | null
    mode: MediaMode | null
    onCancel: () => void
    onRetry: () => void
    onAudioOnly: () => void
}

function getAvatarColor(username: string) {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e']
    const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[index % colors.length]
}

// Thẻ overlay xem trước camera mình khi đang gọi đi (caller chờ đối phương trả lời).
export default function SelfViewPreview({ remoteUsername, localStream, mediaError, mode, onCancel, onRetry, onAudioOnly }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const initial = remoteUsername.charAt(0).toUpperCase()
    const avatarColor = getAvatarColor(remoteUsername)

    // MediaStream KHÔNG gán qua JSX được — phải set .srcObject bằng tay qua ref
    useEffect(() => {
        if (videoRef.current && localStream) {
            videoRef.current.srcObject = localStream
        }
    }, [localStream])

    return (
        <div className="popup-overlay">
            <div className="popup-card outgoing-card">
                <div className="outgoing-video-container">
                    {mediaError ? (
                        <MediaErrorNotice type={mediaError} onRetry={onRetry} onAudioOnly={onAudioOnly} />
                    ) : (
                        <>
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                aria-label="Camera của bạn"
                                className="outgoing-video"
                            />
                            {mode === 'audio-only' && <AudioOnlyBadge />}
                            <button className="outgoing-flip-btn" type="button" aria-label="Chuyển camera">
                                <SwitchCamera size={18} />
                            </button>
                        </>
                    )}
                </div>

                <div className="outgoing-avatar-row">
                    <div className="outgoing-avatar" style={{ background: avatarColor }}>
                        {initial}
                        <span className="outgoing-status-dot" />
                    </div>
                    <span className="outgoing-name">{remoteUsername}</span>
                </div>

                <p className="outgoing-title">
                    Đang gọi cho {remoteUsername}...
                </p>
                <p className="outgoing-subtitle">
                    Đang chờ đối phương trả lời
                </p>
                
                <div className="popup-buttons">
                    <button className="popup-btn cancel" onClick={onCancel} type="button">
                        <PhoneOff size={18} />
                        Hủy cuộc gọi
                    </button>
                </div>
            </div>
        </div>
    )
}
