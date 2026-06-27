type BtnProps = { onClick: () => void; disabled?: boolean }

const base = {
    minWidth: 120,
    height: 44,
    borderRadius: 8,
    border: 'none',
    fontSize: 16,
    cursor: 'pointer',
} as const

const round = (bg: string) => ({
    width: 56, height: 56, borderRadius: '50%', border: 'none',
    color: '#fff', fontSize: 20, cursor: 'pointer', background: bg,
} as const)

export function MuteButton({ muted, onClick }: { muted: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} aria-label={muted ? 'Bật mic' : 'Tắt mic'}
            style={round(muted ? '#6b7280' : 'var(--code-bg)')}>
            {muted ? '🔇' : '🎤'}
        </button>
    )
}

export function CamToggleButton({ off, onClick }: { off: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} aria-label={off ? 'Bật camera' : 'Tắt camera'}
            style={round(off ? '#6b7280' : 'var(--code-bg)')}>
            {off ? '📷' : '📹'}
        </button>
    )
}
export function AcceptButton({ onClick, disabled }: BtnProps) {
    return (
        <button onClick={onClick} disabled={disabled} aria-label="Nhận cuộc gọi"
            style={{ ...base, background: '#16a34a', color: '#fff' }}>
            Nhận
        </button>
    )
}

export function RejectButton({ onClick, disabled }: BtnProps) {
    return (
        <button onClick={onClick} disabled={disabled} aria-label="Từ chối cuộc gọi"
            style={{ ...base, background: '#dc2626', color: '#fff' }}>
            Từ chối
        </button>
    )
}

export function CancelButton({ onClick, disabled }: BtnProps) {
    return (
        <button onClick={onClick} disabled={disabled} aria-label="Hủy cuộc gọi"
            style={{ ...base, background: 'var(--border)', color: 'var(--text-h)' }}>
            Hủy cuộc gọi
        </button>
    )
}

export function HangUpButton({ onClick }: BtnProps) {
    return (
        <button onClick={onClick} aria-label="Kết thúc cuộc gọi"
            style={{
                width: 56, height: 56, borderRadius: '50%', border: 'none',
                background: '#dc2626', color: '#fff', fontSize: 20, fontWeight: 600, cursor: 'pointer',
            }}>
            ✕
        </button>
    )
}
