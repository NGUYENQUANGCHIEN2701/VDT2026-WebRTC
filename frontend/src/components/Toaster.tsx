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
                    padding: '12px 24px', borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 14,
                    background: t.variant === 'warning' ? '#d97706' : '#1f2937',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}>
                    {t.message}
                </div>
            ))}
        </div>
    )
}
