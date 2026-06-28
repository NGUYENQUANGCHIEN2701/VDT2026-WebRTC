import { useQuery } from '@tanstack/react-query'
import { fetchDashboard, type DashboardData } from '../../api/admin'

const STATS: { key: keyof DashboardData; label: string }[] = [
    { key: 'onlineUsers', label: 'Đang trực tuyến' },
    { key: 'activeCalls', label: 'Cuộc gọi đang diễn ra' },
    { key: 'todayStarted', label: 'Cuộc gọi hôm nay' },
    { key: 'todayCompleted', label: 'Hoàn thành' },
    { key: 'todayMissed', label: 'Cuộc gọi nhỡ' },
]

export default function DashboardCards() {
    const { data, isError } = useQuery({
        queryKey: ['admin-dashboard'],
        queryFn: fetchDashboard,
        refetchInterval: 5000,              // poll 5s (D-15)
        placeholderData: (prev) => prev,    // giữ số cũ khi refetch (v5 keepPreviousData)
    })

    return (
        <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {STATS.map((s) => (
                    <div key={s.key} style={{ background: 'var(--code-bg)', borderRadius: 12, padding: 24, boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase' }}>{s.label}</span>
                        <span style={{ fontSize: 44, fontWeight: 600, color: 'var(--text-h)', fontVariantNumeric: 'tabular-nums' }}>
                            {data ? data[s.key] : '…'}
                        </span>
                    </div>
                ))}
            </div>
            {isError && data && (
                <p style={{ marginTop: 12, fontSize: 14, color: 'var(--text)', opacity: 0.6 }}>Cập nhật tạm gián đoạn — đang thử lại…</p>
            )}
        </div>
    )
}
