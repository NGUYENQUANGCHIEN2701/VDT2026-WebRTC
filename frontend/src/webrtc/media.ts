// Lấy camera/mic của user + xử lý lỗi getUserMedia thành thông báo actionable.
// Đây là module TS thường (không React) — UI sẽ gọi vào.

// 6 loại lỗi media ánh xạ từ DOMException.name của trình duyệt
export type MediaErrorType =
    | 'permission-denied'   // user bấm "Chặn" quyền camera/mic
    | 'no-device'           // máy không có camera/mic
    | 'device-busy'         // thiết bị đang bị app khác chiếm
    | 'overconstrained'     // ràng buộc (vd độ phân giải) không đáp ứng được
    | 'security-error'      // không phải secure context (http thường)
    | 'unknown'

// Lỗi có kiểu rõ ràng để UI map sang câu tiếng Việt tương ứng
export class MediaAcquisitionError extends Error {
    constructor(public readonly type: MediaErrorType) {
        super(type)
        this.name = 'MediaAcquisitionError'
    }
}

export interface LocalMedia {
    stream: MediaStream
    mode: 'video' | 'audio-only'   // 'audio-only' khi phải fallback vì không có camera
}

/**
 * Xin camera+mic. Nếu hỏng:
 *  - permission-denied / device-busy / security-error → ném luôn (fallback vô nghĩa)
 *  - no-device / overconstrained → thử lại CHỈ audio; được thì trả mode 'audio-only',
 *    vẫn hỏng thì mới ném.
 */
export async function acquireLocalMedia(): Promise<LocalMedia> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        return { stream, mode: 'video' }
    } catch (err) {
        const name = (err as DOMException).name

        // nhóm KHÔNG fallback
        if (name === 'NotAllowedError') throw new MediaAcquisitionError('permission-denied')
        if (name === 'NotReadableError') throw new MediaAcquisitionError('device-busy')
        if (name === 'SecurityError') throw new MediaAcquisitionError('security-error')

        // nhóm CÓ fallback audio-only: không có camera, hoặc ràng buộc video bất khả thi
        if (name === 'NotFoundError' || name === 'OverconstrainedError') {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
                return { stream, mode: 'audio-only' }
            } catch {
                // ngay cả audio-only cũng hỏng → báo lỗi gốc
                throw new MediaAcquisitionError(name === 'NotFoundError' ? 'no-device' : 'overconstrained')
            }
        }

        throw new MediaAcquisitionError('unknown')
    }
}
