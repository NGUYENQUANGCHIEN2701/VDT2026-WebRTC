import type { PresenceStatus } from '../../realtime/messages'

// Bảng tra: mỗi status → màu + nhãn. IN_CALL build sẵn (D-03), Phase 2 chưa nhận.
const STYLES: Record<PresenceStatus, { color: string; bg: string; label: string }> = {
    ONLINE: { color: '#166534', bg: '#dcfce7', label: 'Trực tuyến' },
    IN_CALL: { color: '#92400e', bg: '#fef3c7', label: 'Đang gọi' },
}

export default function StatusBadge({ status }: { status: PresenceStatus }) {
    const s = STYLES[status]
    return (
        <span
            style={{
                padding: '4px 8px',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1,
                color: s.color,
                background: s.bg,
            }}
        >
            {s.label}
        </span>
    )
}
