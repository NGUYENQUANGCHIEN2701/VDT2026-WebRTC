import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { fetchAdminHistory, type AdminHistoryRow } from "../../api/admin"

const REASON: Record<string, string> = {
  completed: "Hoàn thành",
  missed: "Cuộc gọi nhỡ",
  rejected: "Từ chối",
  cancelled: "Đã hủy",
  dropped: "Mất kết nối",
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—"
  const sec = Math.floor(ms / 1000)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function SystemHistoryTable() {
  const [page, setPage] = useState(0)
  const [inputValue, setInputValue] = useState("")
  const [usernameFilter, setUsernameFilter] = useState("")

  useEffect(() => {
    const t = setTimeout(() => {
      setUsernameFilter(inputValue)
      setPage(0)
    }, 500)
    return () => clearTimeout(t)
  }, [inputValue])

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-history", page, usernameFilter],
    queryFn: () => fetchAdminHistory(page, 20, usernameFilter || undefined),
  })

  const rows: AdminHistoryRow[] = data?.content ?? []

  return (
    <div className="table-card">
      <input
        className="app-input admin-filter"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Lọc theo tên người dùng..."
      />

      {isLoading && <p className="app-muted">Đang tải...</p>}
      {isError && <p className="app-error">Không thể tải lịch sử.</p>}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="app-empty app-empty--compact">
          <h2>{usernameFilter ? `Không tìm thấy cuộc gọi cho "${usernameFilter}"` : "Chưa có cuộc gọi nào trong hệ thống"}</h2>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Cuộc gọi</th>
                  <th>Người gọi</th>
                  <th>Người nhận</th>
                  <th>Kết quả</th>
                  <th>Thời lượng</th>
                  <th>Kết thúc</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.callId}>
                    <td>{r.callId.slice(0, 8)}</td>
                    <td>{r.callerId}</td>
                    <td>{r.calleeId}</td>
                    <td>{REASON[r.endReason] ?? r.endReason}</td>
                    <td>{fmtDuration(r.durationMs)}</td>
                    <td>{fmtDateTime(r.endedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination-row">
            <button className="app-button app-button--ghost app-button--sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} type="button">
              Trước
            </button>
            <span>Trang {(data?.number ?? 0) + 1} / {data?.totalPages ?? 1}</span>
            <button className="app-button app-button--ghost app-button--sm" disabled={!data || page >= data.totalPages - 1} onClick={() => setPage((p) => p + 1)} type="button">
              Sau
            </button>
          </div>
        </>
      )}
    </div>
  )
}
