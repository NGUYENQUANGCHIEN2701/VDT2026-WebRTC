import { beforeEach, describe, expect, it } from 'vitest'
import { useCallStore } from './callStore'

// Store là module singleton — reset() trong beforeEach để cách ly từng test
beforeEach(() => {
    useCallStore.getState().reset()
})

describe('callStore — remoteIsScreenSharing', () => {
    it('mặc định là false', () => {
        expect(useCallStore.getState().remoteIsScreenSharing).toBe(false)
    })

    it('setRemoteIsScreenSharing cập nhật đúng giá trị (true rồi false)', () => {
        useCallStore.getState().setRemoteIsScreenSharing(true)
        expect(useCallStore.getState().remoteIsScreenSharing).toBe(true)

        useCallStore.getState().setRemoteIsScreenSharing(false)
        expect(useCallStore.getState().remoteIsScreenSharing).toBe(false)
    })

    it('reset() đưa remoteIsScreenSharing về false cùng các field khác', () => {
        useCallStore.getState().setRemoteIsScreenSharing(true)
        useCallStore.getState().reset()

        expect(useCallStore.getState().remoteIsScreenSharing).toBe(false)
        // các field khác vẫn về default như trước
        expect(useCallStore.getState().callState).toBe('idle')
        expect(useCallStore.getState().isScreenSharing).toBe(false)
        expect(useCallStore.getState().remoteCamOff).toBe(false)
    })
})
