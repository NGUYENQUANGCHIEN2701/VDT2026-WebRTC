import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { fetchHistory, type HistoryRow } from '../api/history'
import DayGroup from '../components/history/DayGroup'

function dayLabel(iso: string): string {
    const d = new Date(iso)
    const today = new Date()
    const yest = new Date(); yest.setDate(today.getDate() - 1)
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
    if (same(d, today)) return 'Hôm nay'
    if (same(d, yest)) return 'Hôm qua'
    return d.toLocaleDateString('vi-VN')   // DD/MM/YYYY
}

export default function HistoryPage() {
    const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
        useInfiniteQuery({
            queryKey: ['call-history'],
            queryFn: ({ pageParam }) => fetchHistory(pageParam, 20),
            initialPageParam: null as string | null,
            getNextPageParam: (last) => last.nextCursor ?? undefined,
        })

    const rows: HistoryRow[] = data?.pages.flatMap((p) => p.items) ?? []

    // gom các dòng liên tiếp cùng ngày thành nhóm (data đã sort mới→cũ từ BE)
    const groups: { label: string; rows: HistoryRow[] }[] = []
    for (const r of rows) {
        const label = dayLabel(r.endedAt)
        const last = groups[groups.length - 1]
        if (last && last.label === label) last.rows.push(r)
        else groups.push({ label, rows: [r] })
    }

    // sentinel: khi div này lọt vào viewport → tải trang kế
    const sentinelRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        const el = sentinelRef.current
        if (!el || !hasNextPage) return
        const obs = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
        })
        obs.observe(el)
        return () => obs.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    return (
        <div style={{ maxWidth: 800, margin: '40px auto', padding: 24 }}>
            <h1 style={{ fontWeight: 600 }}>Lịch sử cuộc gọi</h1>

            {isLoading && <p>Đang tải…</p>}
            {isError && (
                <p>Không thể tải lịch sử cuộc gọi. <button onClick={() => refetch()}>Thử lại</button></p>
            )}
            {!isLoading && !isError && rows.length === 0 && (
                <div>
                    <h2 style={{ fontWeight: 600 }}>Chưa có cuộc gọi nào</h2>
                    <p>Lịch sử sẽ xuất hiện ở đây sau cuộc gọi đầu tiên của bạn.</p>
                </div>
            )}

            {groups.map((g) => <DayGroup key={g.label} label={g.label} rows={g.rows} />)}

            <div ref={sentinelRef} />
            {isFetchingNextPage && <p>Đang tải…</p>}
        </div>
    )
}
