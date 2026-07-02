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
    readonly type: MediaErrorType
    constructor(type: MediaErrorType) {
        super(type)
        this.name = 'MediaAcquisitionError'
        this.type = type
    }
}

export interface LocalMedia {
    stream: MediaStream
    mode: 'video' | 'audio-only'   // 'audio-only' khi phải fallback vì không có camera
}

// Map 6 loại lỗi → câu tiếng Việt (đúng Copywriting Contract của UI-SPEC).
// Nguồn dùng chung cho MỌI nơi cần hiển thị lỗi getUserMedia cho user (overlay
// MediaErrorNotice LẪN toast ở các luồng không có chỗ hiển thị riêng như
// callee/group) — tránh 2 message khác nhau cho cùng 1 loại lỗi.
export const MEDIA_ERROR_COPY: Record<MediaErrorType, { heading: string; body: string; fallback?: boolean }> = {
    'permission-denied': {
        heading: 'Không có quyền truy cập camera/mic',
        body: 'Hãy cấp lại quyền camera/mic cho trang này rồi bấm Thử lại.',
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

// Chuỗi 1 dòng dùng cho toast (không có chỗ hiển thị heading/body riêng biệt).
export function mediaErrorToastMessage(type: MediaErrorType): string {
    const c = MEDIA_ERROR_COPY[type]
    return `${c.heading} — ${c.body}`
}

// Ràng buộc audio: bật khử vọng (echo) + khử ồn + tự chỉnh gain.
// Trình duyệt thường bật sẵn, nhưng khai báo tường minh để rõ ý đồ và để
// 2 tab cùng máy bớt hú/vọng khi test.
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
}

/**
 * Xin camera+mic. Nếu hỏng:
 *  - permission-denied / device-busy / security-error → ném luôn (fallback vô nghĩa)
 *  - no-device / overconstrained → thử lại CHỈ audio; được thì trả mode 'audio-only',
 *    vẫn hỏng thì mới ném.
 */
export async function acquireLocalMedia(): Promise<LocalMedia> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: AUDIO_CONSTRAINTS })
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
                const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: AUDIO_CONSTRAINTS })
                return { stream, mode: 'audio-only' }
            } catch {
                // ngay cả audio-only cũng hỏng → báo lỗi gốc
                throw new MediaAcquisitionError(name === 'NotFoundError' ? 'no-device' : 'overconstrained')
            }
        }

        throw new MediaAcquisitionError('unknown')
    }
}

/**
 * Retry CHỦ ĐỘNG chỉ-audio, tách riêng khỏi fallback tự động trong
 * acquireLocalMedia() — fallback đó đã CHẠY VÀ HỎNG trước khi no-device/
 * overconstrained được ném ra, nên gọi lại y hệt sẽ vô nghĩa. Hàm này dùng
 * khi USER chủ động bấm "Tiếp tục với âm thanh" sau khi đã thấy lỗi, lúc đó
 * điều kiện mic có thể đã khác (vd rút USB mic rồi cắm lại) nên có thể thành công.
 */
export async function acquireAudioOnlyMedia(): Promise<LocalMedia> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: AUDIO_CONSTRAINTS })
        return { stream, mode: 'audio-only' }
    } catch (err) {
        const name = (err as DOMException).name
        if (name === 'NotAllowedError') throw new MediaAcquisitionError('permission-denied')
        if (name === 'NotReadableError') throw new MediaAcquisitionError('device-busy')
        if (name === 'SecurityError') throw new MediaAcquisitionError('security-error')
        if (name === 'NotFoundError') throw new MediaAcquisitionError('no-device')
        if (name === 'OverconstrainedError') throw new MediaAcquisitionError('overconstrained')
        throw new MediaAcquisitionError('unknown')
    }
}
