import type { MediaErrorType } from '../../webrtc/media'

// Map 6 loại lỗi → câu tiếng Việt (đúng Copywriting Contract của UI-SPEC)
const COPY: Record<MediaErrorType, { heading: string; body: string; fallback?: boolean }> = {
    'permission-denied': {
        heading: 'Không có quyền truy cập camera/mic',
        body: 'Hãy kiểm tra quyền trình duyệt và tải lại trang.',
    },
    'no-device': {
        heading: 'Không tìm thấy camera',
        body: 'Không tìm thấy camera. Bạn có thể tiếp tục chỉ với âm thanh.',
        fallback: true,
    },
    'device-busy': {
        heading: 'Camera đang được dùng bởi ứng dụng khác',
        body: 'Hãy đóng ứng dụng đang dùng camera và thử lại.',
    },
    'overconstrained': {
        heading: 'Camera không đáp ứng được yêu cầu',
        body: 'Tiếp tục với âm thanh.',
        fallback: true,
    },
    'security-error': {
        heading: 'Trang cần HTTPS để truy cập camera',
        body: 'Truy cập ứng dụng qua địa chỉ HTTPS.',
    },
    'unknown': {
        heading: 'Không thể truy cập thiết bị',
        body: 'Có lỗi không xác định. Vui lòng tải lại trang.',
    },
}

export default function MediaErrorNotice({
    type,
    onAudioOnly,
}: {
    type: MediaErrorType
    onAudioOnly?: () => void
}) {
    const c = COPY[type]
    return (
        <div role="alert" style={{ background: 'var(--code-bg)', borderRadius: 4, padding: 16, textAlign: 'center' }}>
            <div aria-hidden="true" style={{ fontSize: 24, color: '#d97706' }}>⚠</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0' }}>{c.heading}</h3>
            <p style={{ fontSize: 16, margin: 0 }}>{c.body}</p>
            {c.fallback && onAudioOnly && (
                <button onClick={onAudioOnly}
                    style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    Tiếp tục với âm thanh
                </button>
            )}
        </div>
    )
}
