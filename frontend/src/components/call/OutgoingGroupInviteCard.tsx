interface Props {
  invitees: string[]
  joined: string[]
  onCancel: () => void
}

function status(username: string, joined: string[]) {
  return joined.includes(username)
    ? { color: '#16a34a', label: 'Đã tham gia' }
    : { color: '#6b7280', label: 'Đang chờ...' }
}

export default function OutgoingGroupInviteCard({ invitees, joined, onCancel }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)',
    }}>
      <div style={{ maxWidth: 400, width: '100%', background: 'var(--code-bg)', borderRadius: 12, padding: 24, boxShadow: 'var(--shadow)' }}>
        <p style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px', textAlign: 'center', color: 'var(--text-h)' }}>
          Đang mời vào phòng nhóm...
        </p>
        <ul style={{ margin: 0, padding: 0 }}>
          {invitees.map((username) => {
            const s = status(username, joined)
            return (
              <li key={username} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', listStyle: 'none', fontSize: 16, color: 'var(--text-h)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} aria-hidden="true" />
                {username}
                <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--text)' }}>{s.label}</span>
              </li>
            )
          })}
        </ul>
        <button
          onClick={onCancel}
          type="button"
          className="app-button app-button--ghost"
          style={{ width: '100%', marginTop: 16 }}
        >
          Hủy mời
        </button>
      </div>
    </div>
  )
}
