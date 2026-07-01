import { useEffect } from "react"
import { Download, Maximize, X, Clock, Calendar, FileText, PlaySquare } from "lucide-react"
import "./RecordingPreviewModalStyles.css"

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

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const year = date.getFullYear()
  let hours = date.getHours()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12
  const mins = date.getMinutes().toString().padStart(2, "0")
  return `${day}/${month}/${year} • ${hours}:${mins} ${ampm}`
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

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleFullscreen = () => {
    const video = document.getElementById('preview-video') as HTMLVideoElement;
    if (video) {
        if (video.requestFullscreen) {
            void video.requestFullscreen();
        }
    }
  };

  return (
    <div className="rpm-backdrop" role="presentation">
      <section className="rpm-modal" role="dialog" aria-modal="true" aria-labelledby="rpm-title">
        <header className="rpm-header">
          <div className="rpm-header-left">
            <div className="rpm-icon-wrapper">
              <PlaySquare size={20} className="rpm-icon" />
            </div>
            <div>
              <h2 id="rpm-title">Bản ghi cuộc gọi đã sẵn sàng</h2>
              <p>Xem lại bản ghi trước khi tải xuống</p>
            </div>
          </div>
          <button className="rpm-close-btn" type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="rpm-video-container">
          <div className="rpm-video-overlay-tl">
            <span className="rpm-dot"></span> Đã ghi hình
          </div>
          <div className="rpm-video-overlay-tr">
            <button className="rpm-overlay-btn" onClick={handleDownload} title="Tải xuống">
              <Download size={16} />
            </button>
            <button className="rpm-overlay-btn" onClick={handleFullscreen} title="Toàn màn hình">
              <Maximize size={16} />
            </button>
          </div>
          <video id="preview-video" className="rpm-video" controls src={previewUrl} />
        </div>

        <div className="rpm-info-cards">
          <div className="rpm-card">
            <Clock size={20} className="rpm-card-icon" />
            <div className="rpm-card-content">
              <span>Thời lượng</span>
              <strong>{formatDuration(durationMs)}</strong>
            </div>
          </div>
          <div className="rpm-card">
            <Calendar size={20} className="rpm-card-icon" />
            <div className="rpm-card-content">
              <span>Ngày ghi</span>
              <strong>{formatDate(new Date())}</strong>
            </div>
          </div>
          <div className="rpm-card">
            <FileText size={20} className="rpm-card-icon" />
            <div className="rpm-card-content">
              <span>Định dạng</span>
              <strong>{mimeType.includes("mp4") ? "MP4" : "WebM"} • 1080p (HD)</strong>
            </div>
          </div>
        </div>

        <div className="rpm-footer">
          <button className="rpm-btn-outline" type="button" onClick={onClose}>
            Đóng
          </button>
          <button className="rpm-btn-primary" type="button" onClick={handleDownload}>
            <Download size={18} />
            Tải xuống bản ghi
          </button>
        </div>
      </section>
    </div>
  )
}
