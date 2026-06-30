import { useToastStore } from '../store/toastStore'

export default function Toaster() {
    const toasts = useToastStore((s) => s.toasts)
    const dismiss = useToastStore((s) => s.dismiss)
    return (
        <div style={{
            position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000,
        }}>
            {toasts.map((t) => (
                <div key={t.id} onClick={() => dismiss(t.id)} style={{
                    padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                    color: t.variant === 'warning' ? '#fff' : 'var(--text-h)', fontSize: 14,
                    background: t.variant === 'warning' ? '#d97706' : 'var(--code-bg)',
                    boxShadow: 'var(--shadow)', maxWidth: 320,
                }}>
                    {t.message}
                </div>
            ))}
        </div>
    )
}
