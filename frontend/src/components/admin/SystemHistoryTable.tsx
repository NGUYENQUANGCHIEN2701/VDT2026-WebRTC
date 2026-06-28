import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { fetchAdminHistory, type AdminHistoryRow } from '../../api/admin'

const REASON: Record<string, string> = {
    completed: 'Hoàn thành', missed: 'Cuộc gọi nhỡ', rejected: 'Từ chối', cancelled: 'Đã hủy', dropped: 'Mất kết nối',
}
function fmtDuration(ms: number | null): string {
    if (ms == null) return '—'
    const sec = Math.floor(ms / 1000)
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}
function fmtDateTime(iso: string): string {
    return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function SystemHistoryTable() {
    const [page, setPage] = useState(0)
    const [inputValue, setInputValue] = useState('')
    const [usernameFilter, setUsernameFilter] = useState('')

    // debounce: chỉ áp filter (→ đổi query key) sau 500ms ngừng gõ → tránh gọi API mỗi phím
    useEffect(() => {
        const t = setTimeout(() => { setUsernameFilter(inputValue); setPage(0) }, 500)
        return () => clearTimeout(t)
    }, [inputValue])

    const { data, isLoading, isError } = useQuery({
        queryKey: ['admin-history', page, usernameFilter],
        queryFn: () => fetchAdminHistory(page, 20, usernameFilter || undefined),
    })

    const rows: AdminHistoryRow[] = data?.content ?? []

    return (
        <div>
            <input value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                placeholder="Lọc theo tên người dùng…"
                style={{ width: 200, padding: 8, marginBottom: 16 }} />

            {isLoading && <p>Đang tải…</p>}
            {isError && <p style={{ color: '#dc2626' }}>Không thể tải lịch sử.</p>}
            {!isLoading && !isError && rows.length === 0 && (
                <p>{usernameFilter ? `Không tìm thấy cuộc gọi cho "${usernameFilter}".` : 'Chưa có cuộc gọi nào trong hệ thống.'}</p>
            )}

            {rows.length > 0 && (
                <>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                                <th style={th}>Cuộc gọi</th><th style={th}>Người gọi</th><th style={th}>Người nhận</th>
                                <th style={th}>Kết quả</th><th style={th}>Thời lượng</th><th style={th}>Kết thúc</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.callId}>
                                    <td style={td}>{r.callId.slice(0, 8)}</td>
                                    <td style={td}>{r.callerId}</td>
                                    <td style={td}>{r.calleeId}</td>
                                    <td style={td}>{REASON[r.endReason] ?? r.endReason}</td>
                                    <td style={td}>{fmtDuration(r.durationMs)}</td>
                                    <td style={td}>{fmtDateTime(r.endedAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
                        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Trước</button>
                        <span>Trang {(data?.number ?? 0) + 1} / {data?.totalPages ?? 1}</span>
                        <button disabled={!data || page >= data.totalPages - 1} onClick={() => setPage((p) => p + 1)}>Sau</button>
                    </div>
                </>
            )}
        </div>
    )
}

const th: React.CSSProperties = { padding: 8, borderBottom: '2px solid #d1d5db' }
const td: React.CSSProperties = { padding: 8, borderBottom: '1px solid #e5e7eb' }
