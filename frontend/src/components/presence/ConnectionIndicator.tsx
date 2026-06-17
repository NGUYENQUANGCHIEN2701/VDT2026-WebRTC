import { usePresenceStore, type ConnectionState } from '../../store/presenceStore'

const MAP: Record<ConnectionState, { color: string; text: string }> = {
    connecting: { color: '#6b7280', text: 'Đang kết nối...' },
    open: { color: '#16a34a', text: 'Đã kết nối' },
    closed: { color: '#dc2626', text: 'Đang kết nối lại...' },
}

export default function ConnectionIndicator() {
    const state = usePresenceStore((s) => s.connectionState)
    const { color, text } = MAP[state]
    return (
        <div
            role="status"
            aria-live="polite"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 24, fontSize: 14, fontWeight: 600 }}
        >
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ color }}>{text}</span>
        </div>
    )
}
