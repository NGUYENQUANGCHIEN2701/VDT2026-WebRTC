import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PeerManager } from './PeerManager'

const callStoreMock = vi.hoisted(() => ({
    setCallState: vi.fn(),
    bumpRemoteStream: vi.fn(),
}))

class MockRTCPeerConnection {
    static instances: MockRTCPeerConnection[] = []

    signalingState = 'stable'
    remoteDescription: unknown = null
    localDescription: unknown = null
    iceConnectionState = 'new'

    onnegotiationneeded: (() => void | Promise<void>) | null = null
    oniceconnectionstatechange: (() => void) | null = null
    onicecandidate: ((e: unknown) => void) | null = null
    ontrack: ((e: unknown) => void) | null = null

    senders: Array<{
        track: { kind: string } | null
        getParameters: ReturnType<typeof vi.fn>
        setParameters: ReturnType<typeof vi.fn>
    }> = []

    setLocalDescription = vi.fn(async () => {
        this.localDescription = { type: 'offer', sdp: 'local-sdp' }
    })
    setRemoteDescription = vi.fn(async (desc: unknown) => {
        this.remoteDescription = desc
    })
    addIceCandidate = vi.fn(async () => { })
    addTrack = vi.fn()
    getSenders = vi.fn(() => this.senders)
    getStats = vi.fn(async () => new Map())
    restartIce = vi.fn()
    close = vi.fn()

    constructor(_config?: unknown) {
        MockRTCPeerConnection.instances.push(this)
    }
}

vi.mock('../store/callStore', () => ({
    useCallStore: { getState: () => callStoreMock },
}))

beforeEach(() => {
    MockRTCPeerConnection.instances = []
    callStoreMock.setCallState.mockClear()
    callStoreMock.bumpRemoteStream.mockClear()
    vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('PeerManager perfect negotiation and candidate buffering', () => {
    it('creates an offer and emits an outbound signal when negotiation is needed', async () => {
        const sendSignal = vi.fn()
        new PeerManager([], false, sendSignal)
        const pc = MockRTCPeerConnection.instances[0]

        await pc.onnegotiationneeded?.()

        expect(pc.setLocalDescription).toHaveBeenCalled()
        expect(sendSignal).toHaveBeenCalledWith(expect.objectContaining({ type: 'sdp' }))
    })

    it('buffers ICE candidates before remoteDescription and drains after SDP arrives', async () => {
        const pm = new PeerManager([], true, vi.fn())
        const pc = MockRTCPeerConnection.instances[0]

        await pm.handleSignalingMessage({ candidate: { candidate: 'cand-1' } })
        expect(pc.addIceCandidate).not.toHaveBeenCalled()

        pc.signalingState = 'stable'
        await pm.handleSignalingMessage({ sdp: { type: 'offer', sdp: 'remote-offer' } })

        expect(pc.setRemoteDescription).toHaveBeenCalled()
        expect(pc.addIceCandidate).toHaveBeenCalledTimes(1)
    })

    it('ignores a colliding offer when this peer is impolite', async () => {
        const pm = new PeerManager([], false, vi.fn())
        const pc = MockRTCPeerConnection.instances[0]

        pc.signalingState = 'have-local-offer'
        await pm.handleSignalingMessage({ sdp: { type: 'offer', sdp: 'colliding-offer' } })

        expect(pc.setRemoteDescription).not.toHaveBeenCalled()
    })
})

describe('PeerManager mesh seams', () => {
    it('uses optional per-peer connection-state callback instead of global 1-1 callStore', () => {
        const onConnectionStateChange = vi.fn()
        const MeshReadyPeerManager = PeerManager as unknown as new (
            iceServers: RTCIceServer[],
            polite: boolean,
            sendSignal: (signal: unknown) => void,
            iceTransportPolicy?: RTCIceTransportPolicy,
            callbacks?: { onConnectionStateChange?: (state: string) => void },
        ) => PeerManager
        new MeshReadyPeerManager([], true, vi.fn(), undefined, { onConnectionStateChange })
        const pc = MockRTCPeerConnection.instances[0]

        pc.iceConnectionState = 'connected'
        pc.oniceconnectionstatechange?.()

        expect(onConnectionStateChange).toHaveBeenCalledWith('connected')
        expect(callStoreMock.setCallState).not.toHaveBeenCalled()
    })

    it('keeps legacy 1-1 fallback writing to callStore when no mesh callback is provided', () => {
        new PeerManager([], true, vi.fn())
        const pc = MockRTCPeerConnection.instances[0]

        pc.iceConnectionState = 'connected'
        pc.oniceconnectionstatechange?.()

        expect(callStoreMock.setCallState).toHaveBeenCalledWith('connected')
    })

    it('setSendersMaxBitrate updates only video senders', async () => {
        const pm = new PeerManager([], true, vi.fn()) as unknown as {
            setSendersMaxBitrate: (maxBitrate: number | null) => Promise<void>
        }
        const pc = MockRTCPeerConnection.instances[0]
        const videoSender = {
            track: { kind: 'video' },
            getParameters: vi.fn(() => ({ encodings: [{}] })),
            setParameters: vi.fn(async () => { }),
        }
        const audioSender = {
            track: { kind: 'audio' },
            getParameters: vi.fn(() => ({ encodings: [{}] })),
            setParameters: vi.fn(async () => { }),
        }
        pc.senders = [videoSender, audioSender]

        await pm.setSendersMaxBitrate(400_000)

        expect(videoSender.setParameters).toHaveBeenCalledWith({
            encodings: [{ maxBitrate: 400_000 }],
        })
        expect(audioSender.setParameters).not.toHaveBeenCalled()

        await pm.setSendersMaxBitrate(null)

        expect(videoSender.setParameters).toHaveBeenLastCalledWith({
            encodings: [{}],
        })
    })
})
