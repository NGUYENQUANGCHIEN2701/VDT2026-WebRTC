import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// stats.ts CHƯA tồn tại → import fail → RED
import { parseStats } from './stats'

/**
 * getStats() trả RTCStatsReport = một Map<id, stat>. Mỗi stat có `type`.
 * Dựng đủ chuỗi: remote-inbound-rtp (RTT/loss), outbound-rtp (bytes/độ phân giải/codec),
 * transport → candidate-pair → local-candidate (loại ICE).
 * timestamp lấy Date.now() để fake-timers điều khiển → tính bitrate delta xác định.
 */
function makeStatsReport(bytesSent: number): RTCStatsReport {
    const ts = Date.now()
    return new Map<string, Record<string, unknown>>([
        ['RIR', { type: 'remote-inbound-rtp', roundTripTime: 0.05, fractionLost: 0.1, timestamp: ts }],
        ['OUT', { type: 'outbound-rtp', bytesSent, frameWidth: 1280, frameHeight: 720, codecId: 'C', timestamp: ts }],
        ['C', { type: 'codec', mimeType: 'video/VP8' }],
        ['T', { type: 'transport', selectedCandidatePairId: 'CP' }],
        ['CP', { type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'LC' }],
        ['LC', { type: 'local-candidate', candidateType: 'relay' }],
    ]) as unknown as RTCStatsReport
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0) // mốc thời gian poll #1
})
afterEach(() => vi.useRealTimers())

describe('parseStats — RTT / bitrate / codec / ICE type', () => {
    it('poll đầu: parse RTT(ms), độ phân giải, codec, loại ICE; bitrate chưa có', () => {
        const s = parseStats(makeStatsReport(10_000))
        expect(s.rttMs).toBe(50)            // roundTripTime 0.05s × 1000 = 50ms
        expect(s.packetLoss).toBe(0.1)
        expect(s.resolution).toBe('1280x720')
        expect(s.codec).toContain('VP8')
        expect(s.candidateType).toBe('relay') // chuỗi transport→pair→local-candidate
        expect(s.bitrateKbps).toBeNull()      // chưa có mẫu trước → chưa tính được delta
    })

    it('poll hai: bitrate = delta bytes giữa 2 lần poll', () => {
        const first = parseStats(makeStatsReport(10_000))
        vi.advanceTimersByTime(1000)          // 1 giây trôi qua
        const second = parseStats(makeStatsReport(20_000), first)
        // (20000-10000) byte × 8 / 1s = 80000 bps = 80 kbps
        expect(second.bitrateKbps).toBe(80)
    })
})
