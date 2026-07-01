/**
 * RED unit tests for RecordingController (Phase 8 / ADV-02).
 *
 * All tests in this file FAIL because recording.ts does not exist yet.
 * Import will throw a module-not-found error → RED.
 *
 * No real browser APIs are called; MediaRecorder, AudioContext,
 * requestAnimationFrame, and cancelAnimationFrame are all vi.fn() stubs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Browser API stubs ───────────────────────────────────────────────────────

// Minimal MediaRecorder stub (constructor + instance methods)
class MockMediaRecorder {
    static instances: MockMediaRecorder[] = []
    static isTypeSupported = vi.fn((_mimeType: string) => false)

    readonly stream: MediaStream
    state = 'inactive'
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    start = vi.fn()
    stop = vi.fn(() => {
        this.state = 'inactive'
        this.onstop?.()
    })
    addEventListener = vi.fn()
    removeEventListener = vi.fn()

    constructor(stream: MediaStream, _options?: { mimeType?: string }) {
        this.stream = stream
        MockMediaRecorder.instances.push(this)
    }
}

// AudioContext stub
class MockAudioContext {
    static instances: MockAudioContext[] = []
    destination = {}
    close = vi.fn(async () => { })
    createMediaStreamSource = vi.fn(() => ({
        connect: vi.fn(),
    }))
    createMediaStreamDestination = vi.fn(() => ({
        stream: {} as MediaStream,
        connect: vi.fn(),
    }))

    constructor() {
        MockAudioContext.instances.push(this)
    }
}

// Fake MediaStreamTrack
function fakeTrack(kind: 'audio' | 'video'): MediaStreamTrack {
    return { kind, enabled: true, stop: vi.fn(), id: `${kind}-${Math.random()}` } as unknown as MediaStreamTrack
}

// Fake MediaStream with configurable tracks
function fakeStream(kinds: Array<'audio' | 'video'> = []): MediaStream {
    const tracks = kinds.map(fakeTrack)
    return {
        getTracks: () => tracks,
        getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
        getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
        addTrack: vi.fn(),
    } as unknown as MediaStream
}

// ── Import the module under test (will fail RED) ────────────────────────────
type Rect = { x: number, y: number, width: number, height: number }

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type RecordingModule = {
    RecordingController: new () => {
        start(localStream: MediaStream, remoteStream: MediaStream, callId: string): void
        stop(): void
        isRecording: boolean
    }
    selectMimeType(): string
    computeGridLayout(count: number, width: number, height: number): Rect[]
    computePresentationLayout(remoteCount: number, width: number, height: number): { main: Rect, speaker: Rect, thumbnails: Rect[] }
}

let mod: RecordingModule

beforeEach(async () => {
    MockMediaRecorder.instances = []
    MockAudioContext.instances = []
    MockMediaRecorder.isTypeSupported.mockReset().mockReturnValue(false)

    vi.stubGlobal('MediaRecorder', MockMediaRecorder)
    vi.stubGlobal('AudioContext', MockAudioContext)
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    // Dynamic import so the file is resolved fresh each test (module missing → RED)
    mod = await import('./recording') as RecordingModule
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
})

// ══════════════════════════════════════════════════════════════════════════════
// MIME fallback ladder selection
// ══════════════════════════════════════════════════════════════════════════════

describe('selectMimeType — MIME fallback ladder', () => {
    it('returns the first supported MIME type from the ordered candidate list', () => {
        // Only vp8 supported
        MockMediaRecorder.isTypeSupported.mockImplementation(
            (mime: string) => mime === 'video/webm;codecs=vp8,opus',
        )

        const mime = mod.selectMimeType()
        expect(mime).toBe('video/webm;codecs=vp8,opus')
    })

    it('prefers vp9 over vp8 when both are supported', () => {
        MockMediaRecorder.isTypeSupported.mockReturnValue(true)

        const mime = mod.selectMimeType()
        expect(mime).toBe('video/webm;codecs=vp9,opus')
    })

    it('returns the first match, not a later one, when multiple types are supported', () => {
        MockMediaRecorder.isTypeSupported.mockImplementation(
            (mime: string) =>
                mime === 'video/webm;codecs=h264,opus' || mime === 'video/webm',
        )

        const mime = mod.selectMimeType()
        expect(mime).toBe('video/webm;codecs=h264,opus')
    })

    it('falls back to empty string when no specific MIME type is supported', () => {
        MockMediaRecorder.isTypeSupported.mockReturnValue(false)

        const mime = mod.selectMimeType()
        expect(mime).toBe('')
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// Cleanup on stop
// ══════════════════════════════════════════════════════════════════════════════

describe('RecordingController — cleanup on stop', () => {
    it('stop() sets isRecording to false', () => {
        const ctrl = new mod.RecordingController()
        ctrl.start(
            fakeStream(['audio', 'video']),
            fakeStream(['audio', 'video']),
            'call-123',
        )
        expect(ctrl.isRecording).toBe(true)

        ctrl.stop()
        expect(ctrl.isRecording).toBe(false)
    })

    it('stop() calls MediaRecorder.stop()', () => {
        const ctrl = new mod.RecordingController()
        ctrl.start(
            fakeStream(['audio', 'video']),
            fakeStream(['audio', 'video']),
            'call-123',
        )

        ctrl.stop()

        expect(MockMediaRecorder.instances[0].stop).toHaveBeenCalled()
    })

    it('stop() cancels the requestAnimationFrame draw loop', () => {
        const rafHandle = 42
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => rafHandle))
        const cancelRaf = vi.fn()
        vi.stubGlobal('cancelAnimationFrame', cancelRaf)

        const ctrl = new mod.RecordingController()
        ctrl.start(
            fakeStream(['audio', 'video']),
            fakeStream(['audio', 'video']),
            'call-abc',
        )

        ctrl.stop()

        expect(cancelRaf).toHaveBeenCalledWith(rafHandle)
    })

    it('stop() closes the AudioContext', async () => {
        const ctrl = new mod.RecordingController()
        ctrl.start(
            fakeStream(['audio', 'video']),
            fakeStream(['audio', 'video']),
            'call-xyz',
        )

        ctrl.stop()

        // Allow any microtask flushes
        await Promise.resolve()
        expect(MockAudioContext.instances[0].close).toHaveBeenCalled()
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeGridLayout — pure layout math mirroring gridStyle() in GroupCallPage.tsx
// ══════════════════════════════════════════════════════════════════════════════

describe('computeGridLayout', () => {
    const WIDTH = 1280
    const HEIGHT = 720

    it('count=1: single rect filling the full canvas', () => {
        const rects = mod.computeGridLayout(1, WIDTH, HEIGHT)
        expect(rects).toHaveLength(1)
        expect(rects[0]).toEqual({ x: 0, y: 0, width: WIDTH, height: HEIGHT })
    })

    it('count=2: two equal side-by-side halves, full height', () => {
        const rects = mod.computeGridLayout(2, WIDTH, HEIGHT)
        expect(rects).toHaveLength(2)
        expect(rects[0]).toEqual({ x: 0, y: 0, width: WIDTH / 2, height: HEIGHT })
        expect(rects[1]).toEqual({ x: WIDTH / 2, y: 0, width: WIDTH / 2, height: HEIGHT })
    })

    it('count=3: rect[2] is centered, half-width, positioned below the first row', () => {
        const rects = mod.computeGridLayout(3, WIDTH, HEIGHT)
        expect(rects).toHaveLength(3)
        // First row: two normal half-width/half-height cells
        expect(rects[0]).toEqual({ x: 0, y: 0, width: WIDTH / 2, height: HEIGHT / 2 })
        expect(rects[1]).toEqual({ x: WIDTH / 2, y: 0, width: WIDTH / 2, height: HEIGHT / 2 })
        // Third tile: centered, half canvas width, in the second row
        const third = rects[2]
        expect(third.y).toBe(HEIGHT / 2)
        expect(third.width).toBe(WIDTH / 2)
        expect(third.height).toBe(HEIGHT / 2)
        expect(third.x).toBe((WIDTH - third.width) / 2)
    })

    it('count=4: standard 2x2 equal grid', () => {
        const rects = mod.computeGridLayout(4, WIDTH, HEIGHT)
        expect(rects).toHaveLength(4)
        expect(rects[0]).toEqual({ x: 0, y: 0, width: WIDTH / 2, height: HEIGHT / 2 })
        expect(rects[1]).toEqual({ x: WIDTH / 2, y: 0, width: WIDTH / 2, height: HEIGHT / 2 })
        expect(rects[2]).toEqual({ x: 0, y: HEIGHT / 2, width: WIDTH / 2, height: HEIGHT / 2 })
        expect(rects[3]).toEqual({ x: WIDTH / 2, y: HEIGHT / 2, width: WIDTH / 2, height: HEIGHT / 2 })
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// computePresentationLayout — mirrors GroupCallStyles.css presentation-* proportions
// ══════════════════════════════════════════════════════════════════════════════

describe('computePresentationLayout', () => {
    const WIDTH = 1280
    const HEIGHT = 720

    it('remoteCount=0: main/speaker rects computed, empty thumbnails array (no divide-by-zero)', () => {
        const layout = mod.computePresentationLayout(0, WIDTH, HEIGHT)
        expect(layout.thumbnails).toHaveLength(0)
        expect(layout.main.width).toBeGreaterThan(0)
        expect(layout.speaker.width).toBeGreaterThan(0)
    })

    it('remoteCount=1: main rect ~65% width, sidebar rect fills remaining width', () => {
        const layout = mod.computePresentationLayout(1, WIDTH, HEIGHT)
        const ratio = layout.main.width / WIDTH
        expect(ratio).toBeGreaterThan(0.6)
        expect(ratio).toBeLessThan(0.7)
        expect(layout.speaker.x).toBeGreaterThanOrEqual(layout.main.x + layout.main.width)
        expect(layout.thumbnails).toHaveLength(1)
    })

    it('remoteCount=3: thumbnails array length matches remoteCount, each equal width summing to sidebar width', () => {
        const layout = mod.computePresentationLayout(3, WIDTH, HEIGHT)
        expect(layout.thumbnails).toHaveLength(3)
        const widths = layout.thumbnails.map((t) => t.width)
        widths.forEach((w) => expect(w).toBeCloseTo(widths[0]))
        const sidebarWidth = layout.speaker.width
        const totalThumbWidth = widths.reduce((sum, w) => sum + w, 0)
        expect(totalThumbWidth).toBeCloseTo(sidebarWidth, 0)
    })
})
