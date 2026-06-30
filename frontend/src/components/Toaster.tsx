import { CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react'
import { useToastStore } from '../store/toastStore'
import { ReactNode } from 'react'

const ICONS: Record<string, ReactNode> = {
    info: <Info size={18} strokeWidth={2.5} style={{ color: '#3b82f6' }} />,
    success: <CheckCircle2 size={18} strokeWidth={2.5} style={{ color: '#10b981' }} />,
    warning: <AlertTriangle size={18} strokeWidth={2.5} style={{ color: '#f59e0b' }} />,
    error: <XCircle size={18} strokeWidth={2.5} style={{ color: '#ef4444' }} />
}

export default function Toaster() {
    const toasts = useToastStore((s) => s.toasts)
    const dismiss = useToastStore((s) => s.dismiss)

    return (
        <div style={{
            position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', gap: 12, zIndex: 9999,
            pointerEvents: 'none', alignItems: 'center'
        }}>
            {toasts.map((t) => (
                <div key={t.id} onClick={() => dismiss(t.id)} className="toast-item" style={{
                    pointerEvents: 'auto',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 20px', borderRadius: 12, cursor: 'pointer',
                    color: 'var(--text-h)', fontSize: 14, fontWeight: 600,
                    background: 'var(--surface)',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                    maxWidth: 400, width: 'max-content',
                    transition: 'transform 0.2s ease, opacity 0.2s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    {ICONS[t.variant] || ICONS.info}
                    <span style={{ paddingTop: 1 }}>{t.message}</span>
                </div>
            ))}
        </div>
    )
}
