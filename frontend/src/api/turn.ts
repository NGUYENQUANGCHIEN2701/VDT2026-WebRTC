import api from './axios'

interface TurnCredentialsResponse {
    urls: string[]
    username: string
    credential: string
}

export interface IceConfig {
    iceServers: RTCIceServer[]
    iceTransportPolicy?: RTCIceTransportPolicy
}

// Lấy credential TURN tạm từ BE → dựng iceServers cho RTCPeerConnection.
// forceRelay=true → ép đi qua TURN relay (để chứng minh TURN ở plan 05).
export async function fetchIceConfig(forceRelay = false): Promise<IceConfig> {
    const { data } = await api.get<TurnCredentialsResponse>('/api/turn-credentials')

    const iceServers: RTCIceServer[] = [
        { urls: data.urls.filter((u) => u.startsWith('stun:')) },
        {
            urls: data.urls.filter((u) => u.startsWith('turn:')),
            username: data.username,
            credential: data.credential,
        },
    ]
    return forceRelay ? { iceServers, iceTransportPolicy: 'relay' } : { iceServers }
}
