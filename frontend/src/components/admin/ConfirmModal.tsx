import { useEffect, useRef } from "react"

interface Props {
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ title, message, confirmLabel = "Xác nhận", destructive = false, onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-modal-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="app-button app-button--ghost" onClick={onCancel} type="button">
            Hủy
          </button>
          <button ref={confirmRef} className={`app-button ${destructive ? "app-button--danger" : ""}`} onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
