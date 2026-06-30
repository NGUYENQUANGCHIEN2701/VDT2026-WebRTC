import { useEffect } from 'react'

interface Props {
  initiatorUsername: string
  memberCount: number
  onAccept: () => void
  onReject: () => void
}

export default function GroupInviteModal({ initiatorUsername, memberCount, onAccept, onReject }: Props) {
  useEffect(() => {
    const timer = setTimeout(onReject, 30_000)
    return () => clearTimeout(timer)
  }, [onReject])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-invite-heading"
      style={{
        position: 'fixed', inset: 0, display: 'flex', zIndex: 1000,
        alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ background: 'var(--code-bg)', borderRadius: 12, padding: 24, maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
        <h2 id="group-invite-heading" style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          {initiatorUsername}
        </h2>
        <p style={{ fontSize: 16, margin: '8px 0 24px', color: 'var(--text)' }}>
          Đang mời bạn vào cuộc gọi nhóm ({memberCount} người)
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <button className="app-button app-button--success" onClick={onAccept} type="button">
            Tham gia
          </button>
          <button className="app-button app-button--danger" onClick={onReject} type="button">
            Từ chối
          </button>
        </div>
      </div>
    </div>
  )
}
