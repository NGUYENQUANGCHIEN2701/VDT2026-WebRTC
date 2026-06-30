import type { EndReason } from '../../realtime/messages'
import { formatDuration } from '../../hooks/useCallDuration'
import { Check, PhoneForwarded, AlertTriangle, Sparkles } from 'lucide-react'

interface Props {
    reason: EndReason
    durationMs: number | null
    onClose: () => void
}

const LABEL: Record<EndReason, { title: string; subtitle: string; warn?: boolean }> = {
    completed: { title: 'Cuộc gọi đã kết thúc', subtitle: 'Cuộc gọi video đã kết thúc thành công.' },
    rejected: { title: 'Cuộc gọi bị từ chối', subtitle: 'Đối phương không thể nghe máy lúc này.', warn: true },
    cancelled: { title: 'Cuộc gọi đã hủy', subtitle: 'Cuộc gọi video đã được hủy thành công.' },
    missed: { title: 'Không có phản hồi', subtitle: 'Đối phương không trả lời.', warn: true },
    busy: { title: 'Máy bận', subtitle: 'Đối phương đang trong cuộc gọi khác.', warn: true },
    dropped: { title: 'Mất kết nối', subtitle: 'Đã xảy ra lỗi kết nối mạng.', warn: true },
}

export default function CallSummaryScreen({ reason, durationMs, onClose }: Props) {
    const { title, subtitle, warn } = LABEL[reason]
    const showDuration = durationMs != null && durationMs > 0

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="call-summary-heading" className="popup-overlay">
            <div className="popup-card">
                <div className={`summary-icon-container ${warn ? 'warn' : ''}`}>
                    <div className="summary-sparkle" style={{ top: 10, right: 10, transform: 'scale(0.8)' }}>
                        <Sparkles size={16} fill="currentColor" />
                    </div>
                    <div className="summary-dot" style={{ top: 20, left: 10, width: 6, height: 6 }} />
                    <div className="summary-dot" style={{ bottom: 15, right: 20, width: 8, height: 8 }} />
                    <div className="summary-icon-circle">
                        {warn ? <AlertTriangle size={32} /> : <Check size={36} strokeWidth={3} />}
                    </div>
                    <div className="summary-icon-ripple" />
                </div>

                <h2 id="call-summary-heading" className="popup-title">
                    {title}
                </h2>
                <p className="popup-subtitle">
                    {subtitle}
                </p>

                {showDuration && (
                    <p style={{ fontSize: 14, margin: '-20px 0 24px', color: 'var(--text)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        Thời gian: {formatDuration(durationMs)}
                    </p>
                )}

                <button className="summary-btn" onClick={onClose} type="button">
                    <PhoneForwarded size={18} />
                    Về ngay
                </button>
            </div>
        </div>
    )
}
