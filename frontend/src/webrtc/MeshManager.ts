import { PeerManager, type InboundSignal, type OutboundSignal } from './PeerManager'
import type { CallState } from '../store/callStore'
import type { PeerConnectionState } from '../store/roomStore'

export const MESH_MAX_VIDEO_BITRATE = 350_000

export const remoteStreams = new Map<string, MediaStream>()

export interface MeshManagerOptions {
    selfId: string
    localStream: MediaStream
    politeFor: (remoteUserId: string) => boolean
    sendSignal: (to: string, signal: OutboundSignal) => void
    iceServers?: RTCIceServer[]
    iceTransportPolicy?: RTCIceTransportPolicy
    onPeerConnectionStateChange?: (userId: string, state: PeerConnectionState) => void
    onRemoteStream?: (userId: string, stream: MediaStream) => void
}

export class MeshManager {
    private readonly selfId: string
    private readonly localStream: MediaStream
    private readonly politeFor: (remoteUserId: string) => boolean
    private readonly sendSignal: (to: string, signal: OutboundSignal) => void
    private readonly iceServers: RTCIceServer[]
    private readonly iceTransportPolicy?: RTCIceTransportPolicy
    private readonly onPeerConnectionStateChange?: (userId: string, state: PeerConnectionState) => void
    private readonly onRemoteStream?: (userId: string, stream: MediaStream) => void
    private readonly peers = new Map<string, PeerManager>()
    private activeMaxBitrate: number | null = null

    constructor(options: MeshManagerOptions) {
        this.selfId = options.selfId
        this.localStream = options.localStream
        this.politeFor = options.politeFor
        this.sendSignal = options.sendSignal
        this.iceServers = options.iceServers ?? []
        this.iceTransportPolicy = options.iceTransportPolicy
        this.onPeerConnectionStateChange = options.onPeerConnectionStateChange
        this.onRemoteStream = options.onRemoteStream
    }

    async joinExistingMembers(members: string[]): Promise<void> {
        for (const member of members) {
            if (member !== this.selfId) this.ensurePeer(member)
        }
        await this.applyBitrateForRoomSize(members.includes(this.selfId) ? members.length : members.length + 1)
    }

    async handleParticipantJoined(username: string, totalParticipants?: number): Promise<void> {
        if (username === this.selfId) return
        this.ensurePeer(username)
        await this.applyBitrateForRoomSize(totalParticipants ?? this.peers.size + 1)
    }

    async handleParticipantLeft(username: string, totalParticipants?: number): Promise<void> {
        const peer = this.peers.get(username)
        if (peer) {
            peer.close()
            this.peers.delete(username)
        }
        remoteStreams.delete(username)
        await this.applyBitrateForRoomSize(totalParticipants ?? this.peers.size + 1)
    }

    async applyBitrateForRoomSize(totalParticipants: number): Promise<void> {
        const nextMaxBitrate = totalParticipants >= 3 ? MESH_MAX_VIDEO_BITRATE : null
        this.activeMaxBitrate = nextMaxBitrate
        await Promise.all([...this.peers.values()].map((peer) => peer.setSendersMaxBitrate(nextMaxBitrate)))
    }

    async handleSignal(from: string, signal: InboundSignal): Promise<void> {
        const peer = this.ensurePeer(from)
        await peer.handleSignalingMessage(signal)
    }

    getPeer(username: string): PeerManager | undefined {
        return this.peers.get(username)
    }

    peerCount(): number {
        return this.peers.size
    }

    getActiveMaxBitrate(): number | null {
        return this.activeMaxBitrate
    }

    close(): void {
        for (const peer of this.peers.values()) peer.close()
        this.peers.clear()
        remoteStreams.clear()
    }

    private ensurePeer(username: string): PeerManager {
        const existing = this.peers.get(username)
        if (existing) return existing

        const peer = this.createPeer(username)
        peer.onRemoteStream = (stream) => {
            remoteStreams.set(username, stream)
            this.onRemoteStream?.(username, stream)
        }
        peer.addLocalStream?.(this.localStream)
        if (this.activeMaxBitrate != null) void peer.setSendersMaxBitrate(this.activeMaxBitrate)
        this.peers.set(username, peer)
        return peer
    }

    private createPeer(username: string): PeerManager {
        const args = [
            this.iceServers,
            this.politeFor(username),
            (signal: OutboundSignal) => this.sendSignal(username, signal),
            this.iceTransportPolicy,
            {
                onConnectionStateChange: (state: CallState) => {
                    const peerState = state as PeerConnectionState
                    this.onPeerConnectionStateChange?.(username, peerState)
                    const peer = this.peers.get(username)
                    if (state === 'connected') void peer?.setSendersMaxBitrate(this.activeMaxBitrate)
                },
            },
        ] as const

        try {
            return new PeerManager(...args)
        } catch (e) {
            if (!(e instanceof TypeError)) throw e
            return (PeerManager as unknown as (...peerArgs: typeof args) => PeerManager)(...args)
        }
    }
}
