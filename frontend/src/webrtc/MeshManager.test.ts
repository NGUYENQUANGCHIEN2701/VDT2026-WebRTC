import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MeshManagerInstance = {
    joinExistingMembers: (members: string[]) => Promise<void> | void
    handleParticipantLeft: (username: string) => void
    applyBitrateForRoomSize: (totalParticipants: number) => Promise<void> | void
    peerCount: () => number
    getPeer: (username: string) => { close: ReturnType<typeof vi.fn>; setSendersMaxBitrate: ReturnType<typeof vi.fn> } | undefined
}

type MeshManagerCtor = new (args: {
    selfId: string
    localStream: MediaStream
    politeFor: (remoteUserId: string) => boolean
    sendSignal: (to: string, signal: unknown) => void
}) => MeshManagerInstance

const peerManagerMock = vi.hoisted(() => ({
    instances: [] as Array<{
        close: ReturnType<typeof vi.fn>
        setSendersMaxBitrate: ReturnType<typeof vi.fn>
    }>,
    constructorSpy: vi.fn(),
}))

vi.mock('./PeerManager', () => ({
    PeerManager: vi.fn().mockImplementation((iceServers, polite, sendSignal) => {
        const peer = {
            close: vi.fn(),
            setSendersMaxBitrate: vi.fn(async () => { }),
        }
        peerManagerMock.constructorSpy({ iceServers, polite, sendSignal })
        peerManagerMock.instances.push(peer)
        return peer
    }),
}))

async function loadMeshManager() {
    const modulePath = './Mesh' + 'Manager'
    const module = await import(/* @vite-ignore */ modulePath) as { MeshManager: MeshManagerCtor }
    return module.MeshManager
}

function createMeshManager(MeshManager: MeshManagerCtor) {
    return new MeshManager({
        selfId: 'alice',
        localStream: {} as MediaStream,
        politeFor: (remoteUserId) => 'alice' > remoteUserId,
        sendSignal: vi.fn(),
    })
}

beforeEach(() => {
    peerManagerMock.instances = []
    peerManagerMock.constructorSpy.mockClear()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('MeshManager peer lifecycle', () => {
    it('creates one PeerManager per existing remote participant outside Zustand', async () => {
        const MeshManager = await loadMeshManager()
        const mesh = createMeshManager(MeshManager)

        await mesh.joinExistingMembers(['bob', 'carol'])

        expect(mesh.peerCount()).toBe(2)
        expect(peerManagerMock.instances).toHaveLength(2)
        expect(mesh.getPeer('bob')).toBe(peerManagerMock.instances[0])
        expect(mesh.getPeer('carol')).toBe(peerManagerMock.instances[1])
    })

    it('participant-left tears down only that peer', async () => {
        const MeshManager = await loadMeshManager()
        const mesh = createMeshManager(MeshManager)
        await mesh.joinExistingMembers(['bob', 'carol'])

        mesh.handleParticipantLeft('bob')

        expect(peerManagerMock.instances[0].close).toHaveBeenCalled()
        expect(peerManagerMock.instances[1].close).not.toHaveBeenCalled()
        expect(mesh.peerCount()).toBe(1)
        expect(mesh.getPeer('carol')).toBe(peerManagerMock.instances[1])
    })
})

describe('MeshManager bitrate caps', () => {
    it('does not cap at two participants, caps at three or four, and uncaps when room shrinks', async () => {
        const MeshManager = await loadMeshManager()
        const mesh = createMeshManager(MeshManager)
        await mesh.joinExistingMembers(['bob', 'carol', 'dave'])

        await mesh.applyBitrateForRoomSize(2)
        expect(peerManagerMock.instances[0].setSendersMaxBitrate).toHaveBeenLastCalledWith(null)

        await mesh.applyBitrateForRoomSize(3)
        for (const peer of peerManagerMock.instances) {
            expect(peer.setSendersMaxBitrate).toHaveBeenLastCalledWith(expect.any(Number))
        }

        await mesh.applyBitrateForRoomSize(4)
        for (const peer of peerManagerMock.instances) {
            expect(peer.setSendersMaxBitrate).toHaveBeenLastCalledWith(expect.any(Number))
        }

        await mesh.applyBitrateForRoomSize(2)
        for (const peer of peerManagerMock.instances) {
            expect(peer.setSendersMaxBitrate).toHaveBeenLastCalledWith(null)
        }
    })
})
