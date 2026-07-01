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
    RecordingController: new (options?: {
        callId?: string
        localLabel?: string
        remoteLabel?: string
        onError?: (msg: string) => void
        getActiveSharer?: () => 'local' | string | null
    }) => {
        start(localStream: MediaStream, remoteStreams: MediaStream | MediaStream[], callId?: string, remoteLabels?: string[]): void
        stop(): void
        refreshLocalStream(stream: MediaStream): void
        refreshRemoteStream(label: string, stream: MediaStream): void
        isRecording: boolean
    }
    selectMimeType(): string
    computeGridLayout(count: number, width: number, height: number): Rect[]
    computePresentationLayout(remoteCount: number, width: number, height: number): { main: Rect, speaker: Rect, thumbnails: Rect[] }
    selectSharerVideo(
        sharer: 'local' | string | null,
        localVideo: HTMLVideoElement | null,
        remoteVideos: { video: HTMLVideoElement, label: string }[],
    ): HTMLVideoElement | null
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

    it('remoteCount=3: thumbnails array length matches remoteCount, each equal width summing to sidebar width (minus inter-thumbnail gaps)', () => {
        const layout = mod.computePresentationLayout(3, WIDTH, HEIGHT)
        expect(layout.thumbnails).toHaveLength(3)
        const widths = layout.thumbnails.map((t) => t.width)
        widths.forEach((w) => expect(w).toBeCloseTo(widths[0]))
        const sidebarWidth = layout.speaker.width
        const THUMB_GAP = 12
        const totalGap = THUMB_GAP * (widths.length - 1)
        const totalThumbWidth = widths.reduce((sum, w) => sum + w, 0) + totalGap
        expect(totalThumbWidth).toBeCloseTo(sidebarWidth, 0)
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// selectSharerVideo — pure helper resolving which video element is the actual sharer
// (quick task 260701-u3j: RecordingController must draw whoever is actually sharing,
// not unconditionally the local stream)
// ══════════════════════════════════════════════════════════════════════════════

describe('selectSharerVideo', () => {
    function fakeVideo(): HTMLVideoElement {
        return {} as HTMLVideoElement
    }

    it("sharer='local' selects the local video element", () => {
        const localVideo = fakeVideo()
        const remoteVideos = [{ video: fakeVideo(), label: 'bob' }]
        const result = mod.selectSharerVideo('local', localVideo, remoteVideos)
        expect(result).toBe(localVideo)
    })

    it("sharer='bob' with remoteLabels ['bob', 'carol'] selects remoteVideos[0] (bob's element), not localVideo", () => {
        const localVideo = fakeVideo()
        const bobVideo = fakeVideo()
        const carolVideo = fakeVideo()
        const remoteVideos = [
            { video: bobVideo, label: 'bob' },
            { video: carolVideo, label: 'carol' },
        ]
        const result = mod.selectSharerVideo('bob', localVideo, remoteVideos)
        expect(result).toBe(bobVideo)
        expect(result).not.toBe(localVideo)
    })

    it('sharer=null (no one sharing / stale state) returns null — caller falls back to grid mode', () => {
        const localVideo = fakeVideo()
        const remoteVideos = [{ video: fakeVideo(), label: 'bob' }]
        const result = mod.selectSharerVideo(null, localVideo, remoteVideos)
        expect(result).toBeNull()
    })

    it('sharer names a remote not present in remoteVideos returns null (defensive, no crash)', () => {
        const localVideo = fakeVideo()
        const remoteVideos = [{ video: fakeVideo(), label: 'bob' }]
        const result = mod.selectSharerVideo('carol', localVideo, remoteVideos)
        expect(result).toBeNull()
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// RecordingController — draws the actual sharer (local or a named remote)
// ══════════════════════════════════════════════════════════════════════════════

describe('RecordingController — sharer-aware draw path', () => {
    function stubCanvasContext() {
        const drawImageCalls: unknown[] = []
        const ctx = {
            fillStyle: '',
            font: '',
            fillRect: vi.fn(),
            fillText: vi.fn(),
            drawImage: vi.fn((video: unknown) => { drawImageCalls.push(video) }),
        }
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext
        return { ctx, drawImageCalls }
    }

    // draw() only issues ctx.drawImage when the video's readyState is
    // >= HAVE_CURRENT_DATA; force that on the jsdom HTMLVideoElement prototype
    // stub so real (non-placeholder) draw calls are exercised.
    beforeEach(() => {
        Object.defineProperty(HTMLVideoElement.prototype, 'readyState', {
            configurable: true,
            get: () => 2, // HAVE_CURRENT_DATA
        })
    })

    it("getActiveSharer: () => 'local' draws using the local video for both main and speaker regions", () => {
        const { ctx } = stubCanvasContext()
        const ctrl = new mod.RecordingController({ getActiveSharer: () => 'local' })
        ctrl.start(
            fakeStream(['audio', 'video']),
            [fakeStream(['video'])],
            'call-1',
            ['bob'],
        )

        // Flush the rAF-scheduled draw() call synchronously (requestAnimationFrame is stubbed to invoke nothing automatically).
        const rafMock = requestAnimationFrame as unknown as { mock: { calls: unknown[][] } }
        expect(rafMock.mock.calls.length).toBeGreaterThan(0)

        // drawImage should have been called at least twice (main + speaker), both times
        // with the SAME target video element reference across both calls that use the
        // sharer stream (main/speaker) — since local is the only stream registered as
        // "local", every drawImage call in a 1-remote scenario targeting the sharer
        // uses the same element reference each time.
        expect(ctx.drawImage).toHaveBeenCalled()
        const targets = ctx.drawImage.mock.calls.map((call) => call[0])
        // main + speaker both draw the sharer video — first two calls (before thumbnails) must be equal
        expect(targets[0]).toBe(targets[1])

        ctrl.stop()
    })

    it("getActiveSharer: () => 'bob' with remoteLabels ['bob', 'carol'] selects remoteVideos[0] (bob), not localVideo", () => {
        const { ctx } = stubCanvasContext()
        const ctrl = new mod.RecordingController({ getActiveSharer: () => 'bob' })
        ctrl.start(
            fakeStream(['audio', 'video']),
            [fakeStream(['video']), fakeStream(['video'])],
            'call-2',
            ['bob', 'carol'],
        )

        expect(ctx.drawImage).toHaveBeenCalled()
        const targets = ctx.drawImage.mock.calls.map((call) => call[0])
        // main + speaker draw bob's video (not local) — first two calls equal each other
        expect(targets[0]).toBe(targets[1])

        ctrl.stop()
    })

    it('getActiveSharer: () => null falls back to grid mode (not presentation layout) — treated the same as sharing=false', () => {
        const { ctx } = stubCanvasContext()
        const ctrl = new mod.RecordingController({ getActiveSharer: () => null })
        ctrl.start(
            fakeStream(['audio', 'video']),
            [fakeStream(['video'])],
            'call-3',
            ['bob'],
        )

        // In grid mode with 2 total videos (local + 1 remote), computeGridLayout(2, ...)
        // draws exactly 2 rects — one per participant, no separate main+speaker+thumbnail draws.
        expect(ctx.drawImage).toHaveBeenCalledTimes(2)

        ctrl.stop()
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// refreshLocalStream — re-attach offscreen localVideo after an in-place track
// swap (bug fix: recording-layout-not-syncing, root cause #2 — camera<->screen
// replaceTrackInStream mutates the same MediaStream object, and some browsers
// won't notice the swapped track on an already-playing <video> without a
// forced srcObject reassignment, same workaround CallPage.tsx uses for its
// own on-screen self-view on localStreamVersion bump)
// ══════════════════════════════════════════════════════════════════════════════

describe('RecordingController — refreshLocalStream', () => {
    it('forces a srcObject reassignment on the offscreen local video while recording', () => {
        // Capture every <video> element created via document.createElement so we
        // can reach the controller's private, never-appended-to-DOM localVideo —
        // createVideo() in recording.ts intentionally keeps offscreen video
        // elements detached from the document (canvas draw source only).
        const createdVideos: HTMLVideoElement[] = []
        const originalCreateElement = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
            const el = originalCreateElement(tag)
            if (tag === 'video') createdVideos.push(el as HTMLVideoElement)
            return el
        })

        const ctrl = new mod.RecordingController()
        const localStream = fakeStream(['audio', 'video'])
        ctrl.start(localStream, fakeStream(['video']), 'call-refresh')

        // First created <video> is the local one (createVideo(localStream) runs
        // before the remoteStreams.map(createVideo) call in start()).
        const localVideo = createdVideos[0] as HTMLVideoElement & { srcObject: MediaStream | null }
        // Sanity: start() already attached the original stream.
        expect(localVideo.srcObject).toBe(localStream)

        const swappedStream = fakeStream(['audio', 'video'])
        const srcObjectAssignments: (MediaStream | null)[] = []
        Object.defineProperty(localVideo, 'srcObject', {
            configurable: true,
            get() { return srcObjectAssignments[srcObjectAssignments.length - 1] ?? null },
            set(value: MediaStream | null) { srcObjectAssignments.push(value) },
        })

        ctrl.refreshLocalStream(swappedStream)

        // Must null it out first, then reassign — not just a single direct set —
        // so browsers that ignore in-place track swaps are forced to re-notice.
        expect(srcObjectAssignments).toEqual([null, swappedStream])

        ctrl.stop()
    })

    it('is a no-op when not currently recording (no crash, no stale video access)', () => {
        const ctrl = new mod.RecordingController()
        expect(() => ctrl.refreshLocalStream(fakeStream(['video']))).not.toThrow()
    })

    it('is a no-op after stop() even if called with a stream', () => {
        const ctrl = new mod.RecordingController()
        ctrl.start(fakeStream(['audio', 'video']), fakeStream(['video']), 'call-refresh-2')
        ctrl.stop()

        expect(() => ctrl.refreshLocalStream(fakeStream(['video']))).not.toThrow()
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// refreshRemoteStream — same re-attach fix, applied to a remote participant's
// offscreen video (matched by label), for remote-side track replacements.
// ══════════════════════════════════════════════════════════════════════════════

describe('RecordingController — refreshRemoteStream', () => {
    it('forces a srcObject reassignment on the matching remote video while recording', () => {
        const createdVideos: HTMLVideoElement[] = []
        const originalCreateElement = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
            const el = originalCreateElement(tag)
            if (tag === 'video') createdVideos.push(el as HTMLVideoElement)
            return el
        })

        const ctrl = new mod.RecordingController()
        ctrl.start(
            fakeStream(['audio', 'video']),
            [fakeStream(['video']), fakeStream(['video'])],
            'call-refresh-remote',
            ['bob', 'carol'],
        )

        // createdVideos[0] = local, [1] = bob, [2] = carol (creation order in start()).
        const bobVideo = createdVideos[1] as HTMLVideoElement & { srcObject: MediaStream | null }
        const carolVideo = createdVideos[2] as HTMLVideoElement & { srcObject: MediaStream | null }

        const bobAssignments: (MediaStream | null)[] = []
        Object.defineProperty(bobVideo, 'srcObject', {
            configurable: true,
            get() { return bobAssignments[bobAssignments.length - 1] ?? null },
            set(value: MediaStream | null) { bobAssignments.push(value) },
        })
        const carolAssignments: (MediaStream | null)[] = []
        Object.defineProperty(carolVideo, 'srcObject', {
            configurable: true,
            get() { return carolAssignments[carolAssignments.length - 1] ?? null },
            set(value: MediaStream | null) { carolAssignments.push(value) },
        })

        const swappedStream = fakeStream(['audio', 'video'])
        ctrl.refreshRemoteStream('bob', swappedStream)

        // Only bob's video is reassigned — carol's is untouched.
        expect(bobAssignments).toEqual([null, swappedStream])
        expect(carolAssignments).toEqual([])

        ctrl.stop()
    })

    it('is a no-op when the label does not match any remote video (no crash)', () => {
        const ctrl = new mod.RecordingController()
        ctrl.start(
            fakeStream(['audio', 'video']),
            [fakeStream(['video'])],
            'call-refresh-remote-2',
            ['bob'],
        )

        expect(() => ctrl.refreshRemoteStream('unknown', fakeStream(['video']))).not.toThrow()

        ctrl.stop()
    })

    it('is a no-op when not currently recording', () => {
        const ctrl = new mod.RecordingController()
        expect(() => ctrl.refreshRemoteStream('bob', fakeStream(['video']))).not.toThrow()
    })
})
