import { Phone, X } from "lucide-react"

interface Props {
    callerUsername: string
    onAccept: () => void
    onReject: () => void
}

function getAvatarColor(username: string) {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e']
    const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[index % colors.length]
}

// Thẻ "cuộc gọi đến" — overlay giữa màn Home khi nhận call-offer-received.
export default function IncomingCallCard({ callerUsername, onAccept, onReject }: Props) {
    const initial = callerUsername.charAt(0).toUpperCase()
    const avatarColor = getAvatarColor(callerUsername)

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="incoming-call-heading" className="popup-overlay">
            <div className="popup-card">
                <div className="popup-avatar-ripple">
                    <div className="popup-floating-dot" style={{ width: 12, height: 12, top: 10, left: -20 }} />
                    <div className="popup-floating-dot" style={{ width: 8, height: 8, bottom: 20, right: -15, background: 'rgba(98, 168, 255, 0.4)' }} />
                    <div className="popup-floating-dot" style={{ width: 6, height: 6, top: 40, right: -30, background: 'rgba(98, 168, 255, 0.2)' }} />
                    <div className="popup-avatar" style={{ background: avatarColor }}>
                        {initial}
                    </div>
                </div>

                <h2 id="incoming-call-heading" className="popup-title">
                    {callerUsername}
                </h2>
                <p className="popup-subtitle">
                    Đang gọi video đến bạn...
                </p>

                <div className="popup-buttons">
                    <button className="popup-btn accept" onClick={onAccept} type="button">
                        <Phone size={18} />
                        Nhận
                    </button>
                    <button className="popup-btn reject" onClick={onReject} type="button">
                        <X size={18} />
                        Từ chối
                    </button>
                </div>
            </div>
        </div>
    )
}
