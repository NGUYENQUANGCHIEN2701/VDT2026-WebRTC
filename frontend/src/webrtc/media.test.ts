import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// media.ts CHƯA tồn tại → import fail → RED
import { acquireLocalMedia, acquireAudioOnlyMedia } from './media'

const getUserMedia = vi.fn()
// MediaStream giả (chỉ cần đủ shape để code không nổ)
const fakeStream = { id: 's', getTracks: () => [] } as unknown as MediaStream
// Tạo lỗi giống DOMException của browser: production phải switch trên err.name
const domError = (name: string) => Object.assign(new Error(name), { name })

beforeEach(() => {
    getUserMedia.mockReset()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
})
afterEach(() => vi.unstubAllGlobals())

describe('acquireLocalMedia — error taxonomy + audio-only fallback', () => {
    it('thành công video → mode "video"', async () => {
        getUserMedia.mockResolvedValueOnce(fakeStream)
        const res = await acquireLocalMedia()
        expect(res.mode).toBe('video')
    })

    it('NotAllowedError → permission-denied (KHÔNG fallback)', async () => {
        getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'))
        await expect(acquireLocalMedia()).rejects.toMatchObject({ type: 'permission-denied' })
    })

    it('NotReadableError → device-busy', async () => {
        getUserMedia.mockRejectedValueOnce(domError('NotReadableError'))
        await expect(acquireLocalMedia()).rejects.toMatchObject({ type: 'device-busy' })
    })

    it('SecurityError → security-error', async () => {
        getUserMedia.mockRejectedValueOnce(domError('SecurityError'))
        await expect(acquireLocalMedia()).rejects.toMatchObject({ type: 'security-error' })
    })

    it('NotFoundError → thử lại audio-only; nếu được → mode "audio-only"', async () => {
        getUserMedia
            .mockRejectedValueOnce(domError('NotFoundError')) // lần 1: xin video+audio, hỏng
            .mockResolvedValueOnce(fakeStream)                // lần 2: xin audio-only, ok
        const res = await acquireLocalMedia()
        expect(res.mode).toBe('audio-only')
        expect(getUserMedia).toHaveBeenCalledTimes(2)
    })

    it('NotFoundError + fallback cũng hỏng → no-device', async () => {
        getUserMedia
            .mockRejectedValueOnce(domError('NotFoundError'))
            .mockRejectedValueOnce(domError('NotFoundError'))
        await expect(acquireLocalMedia()).rejects.toMatchObject({ type: 'no-device' })
    })

    it('OverconstrainedError + fallback hỏng → overconstrained', async () => {
        getUserMedia
            .mockRejectedValueOnce(domError('OverconstrainedError'))
            .mockRejectedValueOnce(domError('OverconstrainedError'))
        await expect(acquireLocalMedia()).rejects.toMatchObject({ type: 'overconstrained' })
    })
})

describe('acquireAudioOnlyMedia — retry chủ động chỉ-audio', () => {
    it('thành công → mode "audio-only", chỉ xin audio (KHÔNG video)', async () => {
        getUserMedia.mockResolvedValueOnce(fakeStream)
        const res = await acquireAudioOnlyMedia()
        expect(res.mode).toBe('audio-only')
        expect(getUserMedia).toHaveBeenCalledWith({ video: false, audio: expect.any(Object) })
    })

    it('NotAllowedError → permission-denied', async () => {
        getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'))
        await expect(acquireAudioOnlyMedia()).rejects.toMatchObject({ type: 'permission-denied' })
    })

    it('NotFoundError → no-device', async () => {
        getUserMedia.mockRejectedValueOnce(domError('NotFoundError'))
        await expect(acquireAudioOnlyMedia()).rejects.toMatchObject({ type: 'no-device' })
    })
})
