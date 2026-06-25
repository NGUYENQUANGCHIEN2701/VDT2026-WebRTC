import { AcceptButton, RejectButton } from './CallButtons'

interface Props {
    callerUsername: string
    onAccept: () => void
    onReject: () => void
}

// Thẻ "cuộc gọi đến" — overlay giữa màn Home khi nhận call-offer-received.
export default function IncomingCallCard({ callerUsername, onAccept, onReject }: Props) {
    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="incoming-call-heading"
            style={{
                position: 'fixed', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)',
            }}
        >
            <div style={{ background: 'var(--code-bg)', borderRadius: 12, padding: 24, maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
                <h2 id="incoming-call-heading" style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>
                    {callerUsername}
                </h2>
                <p style={{ fontSize: 16, margin: '8px 0 24px', color: 'var(--text)' }}>
                    Đang gọi video đến…
                </p>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                    <AcceptButton onClick={onAccept} />
                    <RejectButton onClick={onReject} />
                </div>
            </div>
        </div>
    )
}
