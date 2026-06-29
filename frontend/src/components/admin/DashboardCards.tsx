import { useQuery } from "@tanstack/react-query"
import { fetchDashboard, type DashboardData } from "../../api/admin"

const STATS: { key: keyof DashboardData; label: string }[] = [
  { key: "onlineUsers", label: "Đang trực tuyến" },
  { key: "activeCalls", label: "Cuộc gọi đang diễn ra" },
  { key: "todayStarted", label: "Cuộc gọi hôm nay" },
  { key: "todayCompleted", label: "Hoàn thành" },
  { key: "todayMissed", label: "Cuộc gọi nhỡ" },
]

export default function DashboardCards() {
  const { data, isError } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
  })

  return (
    <div>
      <div className="metric-grid">
        {STATS.map((s) => (
          <div key={s.key} className="metric-card">
            <span>{s.label}</span>
            <strong>{data ? data[s.key] : "..."}</strong>
          </div>
        ))}
      </div>
      {isError && data && (
        <p className="app-muted metric-note">Cập nhật tạm gián đoạn, đang thử lại...</p>
      )}
    </div>
  )
}
