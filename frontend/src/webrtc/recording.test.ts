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

    constructor(public readonly stream: MediaStream, _options?: { mimeType?: string }) {
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
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type RecordingModule = {
    RecordingController: new () => {
        start(localStream: MediaStream, remoteStream: MediaStream, callId: string): void
        stop(): void
        isRecording: boolean
    }
    selectMimeType(): string
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
