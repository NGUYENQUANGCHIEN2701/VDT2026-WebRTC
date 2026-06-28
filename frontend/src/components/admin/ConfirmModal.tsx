import { useEffect, useRef } from 'react'

interface Props {
    title: string
    message: string
    confirmLabel?: string
    destructive?: boolean
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmModal({ title, message, confirmLabel = 'Xác nhận', destructive = false, onConfirm, onCancel }: Props) {
    const confirmRef = useRef<HTMLButtonElement | null>(null)

    useEffect(() => {
        confirmRef.current?.focus()
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onCancel])

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" onClick={onCancel}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
            <div onClick={(e) => e.stopPropagation()}
                style={{ background: 'var(--code-bg)', borderRadius: 12, padding: 24, maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)' }}>
                <h2 id="confirm-modal-title" style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text-h)' }}>{title}</h2>
                <p style={{ fontSize: 14, color: 'var(--text)', margin: '12px 0 24px' }}>{message}</p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button onClick={onCancel}
                        style={{ padding: '8px 16px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
                        Hủy
                    </button>
                    <button ref={confirmRef} onClick={onConfirm}
                        style={{ padding: '8px 16px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', background: destructive ? '#dc2626' : 'var(--accent, #2563eb)', color: '#fff' }}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
