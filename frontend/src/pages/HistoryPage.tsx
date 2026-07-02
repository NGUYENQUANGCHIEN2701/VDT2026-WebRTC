import { useInfiniteQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { RefreshCcw } from "lucide-react"
import AppChrome from "../components/AppChrome"
import DayGroup from "../components/history/DayGroup"
import { fetchHistory, type HistoryRow } from "../api/history"

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return "Hôm nay"
  if (same(d, yest)) return "Hôm qua"
  return d.toLocaleDateString("vi-VN")
}

export default function HistoryPage() {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["call-history"],
      queryFn: ({ pageParam }) => fetchHistory(pageParam, 20),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    })

  const rows: HistoryRow[] = data?.pages.flatMap((p) => p.items) ?? []
  const groups: { label: string; rows: HistoryRow[] }[] = []
  for (const r of rows) {
    const label = dayLabel(r.endedAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.rows.push(r)
    else groups.push({ label, rows: [r] })
  }

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
    <AppChrome>
      <section className="app-hero app-hero--compact">
        <div>
          <span className="app-kicker" style={{ textTransform: 'uppercase', letterSpacing: '1px' }}>Lịch sử cuộc gọi</span>
          <h1>Lịch sử cuộc gọi</h1>
          <p>Theo dõi kết quả, thời lượng và thời điểm kết thúc của các cuộc gọi gần đây.</p>
        </div>
        <button className="app-button app-button--ghost" style={{ borderRadius: '999px', color: 'var(--accent)', borderColor: 'var(--border)' }} onClick={() => refetch()} type="button">
          <RefreshCcw size={17} />
          Làm mới
        </button>
      </section>

      <section className="app-panel history-panel">
        {isLoading && <p className="app-muted">Đang tải...</p>}
        {isError && (
          <div className="app-empty">
            <h2>Không thể tải lịch sử cuộc gọi</h2>
            <button className="app-button" onClick={() => refetch()} type="button">Thử lại</button>
          </div>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <div className="app-empty">
            <h2>Chưa có cuộc gọi nào</h2>
            <p>Lịch sử sẽ xuất hiện ở đây sau cuộc gọi đầu tiên của bạn.</p>
          </div>
        )}

        {groups.map((g) => <DayGroup key={g.label} label={g.label} rows={g.rows} />)}

        <div ref={sentinelRef} />
        {isFetchingNextPage && <p className="app-muted history-loading">Đang tải thêm...</p>}
      </section>
    </AppChrome>
  )
}
