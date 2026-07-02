import { MEDIA_ERROR_COPY, type MediaErrorType } from '../../webrtc/media'

export default function MediaErrorNotice({
    type,
    onRetry,
    onAudioOnly,
}: {
    type: MediaErrorType
    onRetry?: () => void
    onAudioOnly?: () => void
}) {
    const c = MEDIA_ERROR_COPY[type]
    const showAudioOnly = c.fallback && onAudioOnly
    return (
        <div role="alert" style={{ background: 'var(--code-bg)', borderRadius: 4, padding: 16, textAlign: 'center' }}>
            <div aria-hidden="true" style={{ fontSize: 24, color: '#d97706' }}>⚠</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0' }}>{c.heading}</h3>
            <p style={{ fontSize: 16, margin: 0 }}>{c.body}</p>
            {(onRetry || showAudioOnly) && (
                <div style={{ marginTop: 12, display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
                    {onRetry && (
                        <button onClick={onRetry}
                            style={{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                            Thử lại
                        </button>
                    )}
                    {showAudioOnly && (
                        <button onClick={onAudioOnly}
                            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                            Tiếp tục với âm thanh
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
