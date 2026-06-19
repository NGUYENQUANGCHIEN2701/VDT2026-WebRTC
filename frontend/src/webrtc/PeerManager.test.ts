import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// PeerManager.ts CHƯA tồn tại → import fail → test ĐỎ (đúng baseline Wave 0)
import { PeerManager } from './PeerManager'

/**
 * Mock RTCPeerConnection: browser thật có sẵn, test phải tự dựng (giống MockWebSocket).
 * Lộ ra: event hook (onnegotiationneeded...) + spy (setLocal/Remote/addIceCandidate) +
 * signalingState/remoteDescription settable để dựng tình huống collision & buffering.
 */
class MockRTCPeerConnection {
    static instances: MockRTCPeerConnection[] = []

    signalingState = 'stable'
    remoteDescription: unknown = null
    localDescription: unknown = null
    iceConnectionState = 'new'

    // event hook — PeerManager gán handler của nó vào đây ở constructor
    onnegotiationneeded: (() => void | Promise<void>) | null = null
    oniceconnectionstatechange: (() => void) | null = null
    onicecandidate: ((e: unknown) => void) | null = null
    ontrack: ((e: unknown) => void) | null = null

    // spy: setLocalDescription() KHÔNG tham số (implicit offer/answer) → tự gán localDescription
    setLocalDescription = vi.fn(async () => {
        this.localDescription = { type: 'offer', sdp: 'local-sdp' }
    })
    // setRemoteDescription phải GÁN remoteDescription để bước drain buffer chạy đúng
    setRemoteDescription = vi.fn(async (desc: unknown) => {
        this.remoteDescription = desc
    })
    addIceCandidate = vi.fn(async () => { })
    addTrack = vi.fn()
    getStats = vi.fn(async () => new Map())
    close = vi.fn()

    constructor(_config?: unknown) {
        MockRTCPeerConnection.instances.push(this)
    }
}

// callStore CHƯA có → mock phòng khi PeerManager gọi vào (vô hại nếu không dùng)
vi.mock('../store/callStore', () => ({
    useCallStore: { getState: () => ({ setConnectionState: vi.fn(), setRemoteStream: vi.fn() }) },
}))

beforeEach(() => {
    MockRTCPeerConnection.instances = []
    vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection) // thay RTCPeerConnection thật
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('PeerManager — perfect negotiation + candidate buffering', () => {
    // (a) onnegotiationneeded → tạo offer (setLocalDescription) → phát signal qua sendSignal
    it('onnegotiationneeded tạo offer và phát signal', async () => {
        const sendSignal = vi.fn()
        new PeerManager([], false, sendSignal) // (iceServers, polite, sendSignal)
        const pc = MockRTCPeerConnection.instances[0]

        await pc.onnegotiationneeded?.() // giả lập browser bắn sự kiện (vd khi addTrack)

        expect(pc.setLocalDescription).toHaveBeenCalled()
        expect(sendSignal).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'sdp' }),
        )
    })

    // (b) ICE candidate tới KHI remoteDescription==null → BUFFER; setRemoteDescription xong → DRAIN
    it('buffer ICE candidate trước remoteDescription rồi drain sau', async () => {
        const pm = new PeerManager([], true, vi.fn()) // polite
        const pc = MockRTCPeerConnection.instances[0]

        // remoteDescription còn null → candidate phải được giữ lại, CHƯA addIceCandidate
        await pm.handleSignalingMessage({ candidate: { candidate: 'cand-1' } })
        expect(pc.addIceCandidate).not.toHaveBeenCalled()

        // offer tới → setRemoteDescription chạy → drain buffer
        pc.signalingState = 'stable'
        await pm.handleSignalingMessage({ sdp: { type: 'offer', sdp: 'remote-offer' } })

        expect(pc.setRemoteDescription).toHaveBeenCalled()
        expect(pc.addIceCandidate).toHaveBeenCalledTimes(1) // candidate đã buffer được xả ra
    })

    // (c) impolite peer gặp offer xung đột → BỎ QUA (không setRemoteDescription)
    it('impolite peer bỏ qua offer xung đột (ignoreOffer)', async () => {
        const pm = new PeerManager([], false, vi.fn()) // impolite (polite=false)
        const pc = MockRTCPeerConnection.instances[0]

        // signalingState != 'stable' → ta đang giữ local offer → offer tới = collision
        pc.signalingState = 'have-local-offer'
        await pm.handleSignalingMessage({ sdp: { type: 'offer', sdp: 'colliding-offer' } })

        expect(pc.setRemoteDescription).not.toHaveBeenCalled() // impolite "thắng" → kệ offer kia
    })
})
