import type { EndReason } from '../../realtime/messages'
import { formatDuration } from '../../hooks/useCallDuration'

interface Props {
    reason: EndReason
    durationMs: number | null
    onClose: () => void
}

// Nhãn cho 6 lý do kết thúc. 'dropped' tô vàng cảnh báo (D-08) vì là sự cố,
// còn lại trung tính. 'busy'/'missed' thường đã xử lý bằng toast trước khi
// tới đây, nhưng vẫn để đủ 6 cho chắc.
const LABEL: Record<EndReason, { title: string; warn?: boolean }> = {
    completed: { title: 'Cuộc gọi đã kết thúc' },
    rejected: { title: 'Cuộc gọi bị từ chối' },
    cancelled: { title: 'Cuộc gọi đã hủy' },
    missed: { title: 'Không có phản hồi' },
    busy: { title: 'Máy bận' },
    dropped: { title: 'Mất kết nối', warn: true },
}

// Màn tổng kết sau khi cuộc gọi kết thúc. Tự đóng sau 3s (do callActions),
// nhưng có nút "Về ngay" để bỏ qua chờ.
export default function CallSummaryScreen({ reason, durationMs, onClose }: Props) {
    const { title, warn } = LABEL[reason]
    const showDuration = durationMs != null && durationMs > 0

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="call-summary-heading"
            style={{
                position: 'fixed', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)',
            }}
        >
            <div style={{ background: 'var(--code-bg)', borderRadius: 12, padding: 24, maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
                <h2 id="call-summary-heading" style={{ fontSize: 22, fontWeight: 600, margin: 0, color: warn ? '#d97706' : 'var(--text)' }}>
                    {title}
                </h2>
                {showDuration && (
                    <p style={{ fontSize: 16, margin: '8px 0 0', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                        Thời lượng: {formatDuration(durationMs)}
                    </p>
                )}
                <button
                    onClick={onClose}
                    style={{ marginTop: 24, padding: '10px 24px', fontSize: 15, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent, #2563eb)', color: '#fff' }}
                >
                    Về ngay
                </button>
            </div>
        </div>
    )
}
