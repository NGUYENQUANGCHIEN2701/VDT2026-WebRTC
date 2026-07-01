import { useEffect } from "react"
import { Download } from "lucide-react"

interface RecordingPreviewModalProps {
  open: boolean
  previewUrl: string | null
  mimeType: string
  durationMs: number
  downloadName: string
  onClose: () => void
}

function formatDuration(durationMs: number): string {
  const total = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(total / 60).toString().padStart(2, "0")
  const seconds = (total % 60).toString().padStart(2, "0")
  return `${minutes}:${seconds}`
}

export default function RecordingPreviewModal({
  open,
  previewUrl,
  mimeType,
  durationMs,
  downloadName,
  onClose,
}: RecordingPreviewModalProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose, open])

  if (!open || !previewUrl) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card recording-preview-modal" role="dialog" aria-modal="true" aria-labelledby="recording-preview-title">
        <h2 id="recording-preview-title">Recording ready</h2>
        <video className="recording-preview-video" controls src={previewUrl} />
        <div className="recording-preview-meta">
          <span>Duration {formatDuration(durationMs)}</span>
          <span>{mimeType || "video/webm"}</span>
        </div>
        <div className="modal-actions">
          <a className="app-button" href={previewUrl} download={downloadName}>
            <Download size={16} />
            Download recording
          </a>
          <button className="app-button app-button--ghost" type="button" onClick={onClose}>
            Close preview
          </button>
        </div>
      </section>
    </div>
  )
}
