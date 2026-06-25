// Badge "Chỉ âm thanh" — đặt absolute góc trên-trái vùng video tối khi ở chế độ audio-only.
export default function AudioOnlyBadge() {
    return (
        <span style={{
            position: 'absolute', top: 8, left: 8,
            background: '#fef3c7', color: '#92400e',
            padding: '4px 8px', borderRadius: 999,
            fontSize: 14, fontWeight: 600, lineHeight: 1,
        }}>
            Chỉ âm thanh
        </span>
    )
}
