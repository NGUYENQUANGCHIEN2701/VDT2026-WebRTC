// Đọc & phân tích RTCPeerConnection.getStats() → chỉ số chất lượng cuộc gọi.
// Module TS thường (không React); DebugPanel/QualityIndicator hiển thị kết quả.

export interface StatsSample {
    rttMs: number | null            // round-trip time (ms) từ remote-inbound-rtp
    packetLoss: number | null       // fractionLost (0..1)
    bitrateKbps: number | null      // delta bytesSent giữa 2 lần poll (null ở lần đầu)
    codec: string | null            // vd "video/VP8"
    resolution: string | null       // vd "1280x720"
    candidateType: RTCIceCandidateType | null // host | srflx | relay
    bytesSent: number               // để tính delta cho lần poll kế
    timestamp: number               // mốc thời gian của outbound-rtp
}

/**
 * Phân tích 1 RTCStatsReport thành StatsSample. Truyền `prev` (mẫu lần trước)
 * để tính bitrate theo delta. Field nào không có → null (UI hiện "—").
 */
export function parseStats(report: RTCStatsReport, prev?: StatsSample): StatsSample {
    let rttMs: number | null = null
    let packetLoss: number | null = null
    let codec: string | null = null
    let resolution: string | null = null
    let candidateType: RTCIceCandidateType | null = null
    let bytesSent = 0
    let timestamp = 0
    let codecId: string | undefined
    let selectedPairId: string | undefined

    report.forEach((stat) => {
        if (stat.type === 'remote-inbound-rtp') {
            if (typeof stat.roundTripTime === 'number') rttMs = stat.roundTripTime * 1000
            if (typeof stat.fractionLost === 'number') packetLoss = stat.fractionLost
        } else if (stat.type === 'outbound-rtp') {
            bytesSent = stat.bytesSent ?? 0
            timestamp = stat.timestamp ?? 0
            if (stat.frameWidth && stat.frameHeight) resolution = `${stat.frameWidth}x${stat.frameHeight}`
            codecId = stat.codecId
        } else if (stat.type === 'transport') {
            selectedPairId = stat.selectedCandidatePairId
        }
    })

    // codec: outbound-rtp.codecId → tra report sang stat 'codec' → mimeType
    if (codecId) {
        const c = report.get(codecId)
        if (c && typeof c.mimeType === 'string') codec = c.mimeType
    }

    // loại ICE: transport.selectedCandidatePairId → candidate-pair.localCandidateId → local-candidate.candidateType
    if (selectedPairId) {
        const pair = report.get(selectedPairId)
        if (pair?.localCandidateId) {
            const local = report.get(pair.localCandidateId)
            if (local?.candidateType) candidateType = local.candidateType
        }
    }

    // bitrate = (Δbytes × 8) / Δgiây / 1000 → kbps
    let bitrateKbps: number | null = null
    if (prev && timestamp > prev.timestamp) {
        const deltaBytes = bytesSent - prev.bytesSent
        const deltaMs = timestamp - prev.timestamp
        bitrateKbps = Math.round((deltaBytes * 8) / (deltaMs / 1000) / 1000)
    }

    return { rttMs, packetLoss, bitrateKbps, codec, resolution, candidateType, bytesSent, timestamp }
}

/** Cung cấp getStats (PeerManager sẽ thỏa interface này). */
export interface StatsProvider {
    getStats(): Promise<RTCStatsReport>
}

/**
 * Poll getStats mỗi `intervalMs` → gọi onStats với StatsSample. Trả hàm stop()
 * để clear interval (DebugPanel gọi khi đóng/unmount → không poll khi ẩn).
 */
export function startStatsPolling(
    provider: StatsProvider,
    onStats: (s: StatsSample) => void,
    intervalMs = 1000,
): () => void {
    let prev: StatsSample | undefined
    const id = setInterval(async () => {
        const report = await provider.getStats()
        const sample = parseStats(report, prev)
        prev = sample
        onStats(sample)
    }, intervalMs)
    return () => clearInterval(id)
}
