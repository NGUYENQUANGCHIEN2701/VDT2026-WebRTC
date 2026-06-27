import { useEffect, useState } from 'react'
import { useCallStore } from '../store/callStore'

// "m:ss" (hoặc "h:mm:ss" nếu ≥ 1 giờ) từ mili-giây. Dùng chung cho
// thanh trên cuộc gọi và CallSummaryScreen (mục 8).
export function formatDuration(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000))
    const s = total % 60
    const m = Math.floor(total / 60) % 60
    const h = Math.floor(total / 3600)
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// Thời lượng cuộc gọi đang chạy, đếm từ mốc 'connected'. Tự tick mỗi giây.
// Trả null khi chưa kết nối (chưa có gì để hiển thị).
export function useCallDuration(): string | null {
    const connectedAt = useCallStore((s) => s.connectedAt)
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        if (connectedAt == null) return
        setNow(Date.now())   // cập nhật ngay, không chờ 1s đầu
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [connectedAt])

    if (connectedAt == null) return null
    return formatDuration(now - connectedAt)
}
