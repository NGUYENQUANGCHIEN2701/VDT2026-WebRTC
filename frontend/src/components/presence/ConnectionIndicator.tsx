import { usePresenceStore, type ConnectionState } from "../../store/presenceStore"

const MAP: Record<ConnectionState, { className: string; text: string }> = {
  connecting: { className: "presence-dot--muted", text: "Đang kết nối..." },
  open: { className: "presence-dot--online", text: "Đã kết nối" },
  closed: { className: "presence-dot--danger", text: "Đang kết nối lại..." },
}

export default function ConnectionIndicator() {
  const state = usePresenceStore((s) => s.connectionState)
  const { className, text } = MAP[state]

  return (
    <div className="connection-indicator" role="status" aria-live="polite">
      <span aria-hidden="true" className={`presence-dot ${className}`} />
      <span>{text}</span>
    </div>
  )
}
