export default function RemoteMuteIndicator() {
    return (
        <div style={{
            position: 'absolute', top: 8, left: 8, padding: '4px 8px', borderRadius: 6,
            background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, display: 'flex', gap: 4, alignItems: 'center'
        }}>
            🔇 Đã tắt mic
        </div>
    )
}
