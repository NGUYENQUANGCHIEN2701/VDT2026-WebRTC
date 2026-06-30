export default function RemoteCamOffOverlay({ username }: { username: string }) {
    const initial = username.charAt(0).toUpperCase()
    return (
        <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: '#1f2937', zIndex: 10
        }}>
            <div style={{
                width: 96, height: 96, borderRadius: '50%', background: 'var(--code-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: '#fff'
            }}>
                {initial}
            </div>
        </div>
    )
}
