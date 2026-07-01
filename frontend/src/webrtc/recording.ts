type RecordingControllerOptions = {
    callId?: string
    localLabel?: string
    remoteLabel?: string
    /** Task 3 (Wave 4): callback invoked if MediaRecorder fires an onerror event */
    onError?: (msg: string) => void
    /** Quick task 260701-tkz: live reader for the current screen-share state, polled every draw frame */
    isScreenSharing?: () => boolean
}

export type Rect = { x: number, y: number, width: number, height: number }

type RecordingResult = {
    previewUrl: string
    mimeType: string
    durationMs: number
}

const WIDTH = 1280
const HEIGHT = 720
const FPS = 30

/**
 * Quick task 260701-tkz: pure grid layout math mirroring `gridStyle()` +
 * the `isThirdInThree` special case in GroupCallPage.tsx, so the recorder's
 * canvas composition matches the on-screen tile layout exactly.
 */
export function computeGridLayout(count: number, width: number, height: number): Rect[] {
    if (count <= 0) return []

    if (count === 1) {
        return [{ x: 0, y: 0, width, height }]
    }

    if (count === 2) {
        const cellWidth = width / 2
        return [
            { x: 0, y: 0, width: cellWidth, height },
            { x: cellWidth, y: 0, width: cellWidth, height },
        ]
    }

    // count === 3 and count > 3 both use a 2-column grid (matches the
    // `else` branch of gridStyle: repeat(2, 1fr) columns, repeat(2, 1fr) rows,
    // extended to Math.ceil(count / 2) rows for counts beyond 4).
    const cols = 2
    const rows = Math.ceil(count / cols)
    const cellWidth = width / cols
    const cellHeight = height / rows
    const rects: Rect[] = []

    for (let index = 0; index < count; index++) {
        const isThirdInThree = count === 3 && index === 2
        if (isThirdInThree) {
            const thirdWidth = width / 2
            rects.push({
                x: (width - thirdWidth) / 2,
                y: cellHeight, // row 1 (second row) — mirrors gridColumn: '1 / -1' placed below row 0
                width: thirdWidth,
                height: cellHeight,
            })
            continue
        }
        const col = index % cols
        const row = Math.floor(index / cols)
        rects.push({ x: col * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight })
    }

    return rects
}

/**
 * Quick task 260701-tkz: pure presentation-mode layout math mirroring the
 * `.presentation-main` / `.presentation-sidebar` / `.presentation-speaker` /
 * `.presentation-thumbnails` flex proportions in GroupCallStyles.css.
 */
export function computePresentationLayout(
    remoteCount: number,
    width: number,
    height: number,
): { main: Rect, speaker: Rect, thumbnails: Rect[] } {
    const GAP = 16
    const THUMBNAIL_HEIGHT = 140

    // .presentation-layout: flex row, gap 16px, main flex:6.5, sidebar flex:3.5 (total 10)
    const availableWidth = width - GAP
    const mainWidth = availableWidth * (6.5 / 10)
    const sidebarWidth = availableWidth - mainWidth
    const sidebarX = mainWidth + GAP

    const main: Rect = { x: 0, y: 0, width: mainWidth, height }

    // .presentation-sidebar: flex column, gap 16px -> speaker (flex:1) above
    // a fixed-height thumbnails row (only present when there are remotes).
    const hasThumbnails = remoteCount > 0
    const thumbnailsHeight = hasThumbnails ? Math.min(THUMBNAIL_HEIGHT, height) : 0
    const sidebarGap = hasThumbnails ? GAP : 0
    const speakerHeight = height - thumbnailsHeight - sidebarGap

    const speaker: Rect = { x: sidebarX, y: 0, width: sidebarWidth, height: speakerHeight }

    const thumbnails: Rect[] = []
    if (hasThumbnails) {
        const thumbnailsY = speakerHeight + sidebarGap
        const thumbGap = 12
        const totalGap = thumbGap * (remoteCount - 1)
        const thumbWidth = (sidebarWidth - totalGap) / remoteCount
        for (let i = 0; i < remoteCount; i++) {
            thumbnails.push({
                x: sidebarX + i * (thumbWidth + thumbGap),
                y: thumbnailsY,
                width: thumbWidth,
                height: thumbnailsHeight,
            })
        }
    }

    return { main, speaker, thumbnails }
}

export function selectMimeType(): string {
    const candidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        '',
    ]

    return candidates.find((mimeType) => mimeType === '' || MediaRecorder.isTypeSupported(mimeType)) ?? ''
}

function createVideo(stream: MediaStream): HTMLVideoElement {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    const playResult = video.play()
    if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(() => { })
    }
    return video
}

function getAudioContextCtor(): typeof AudioContext {
    return window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
}

function makeStream(tracks: MediaStreamTrack[]): MediaStream {
    if (typeof MediaStream !== 'undefined') {
        return new MediaStream(tracks)
    }
    return {
        getTracks: () => tracks,
        getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
        getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
        addTrack: () => { },
    } as unknown as MediaStream
}

export class RecordingController {
    private metadata: { callId: string }
    private localLabel: string
    private remoteLabel: string
    private onError: ((msg: string) => void) | undefined
    private canvas: HTMLCanvasElement | null = null
    private canvasStream: MediaStream | null = null
    private localVideo: HTMLVideoElement | null = null
    private remoteVideos: { video: HTMLVideoElement, label: string }[] = []
    private audioContext: AudioContext | null = null
    private recorder: MediaRecorder | null = null
    private chunks: Blob[] = []
    private frameId: number | null = null
    private startedAt = 0
    private objectUrl: string | null = null
    private _isRecording = false
    private isScreenSharing: (() => boolean) | undefined

    constructor(options: RecordingControllerOptions = {}) {
        this.metadata = { callId: options.callId ?? '' }
        this.localLabel = options.localLabel ?? 'You'
        this.remoteLabel = options.remoteLabel ?? 'Remote'
        this.onError = options.onError
        this.isScreenSharing = options.isScreenSharing
    }

    get isRecording(): boolean {
        return this._isRecording
    }

    start(localStream: MediaStream, remoteStreams: MediaStream | MediaStream[], callId?: string, remoteLabels?: string[]): void {
        if (this._isRecording) return
        if (callId) this.metadata.callId = callId

        this.cleanupObjectUrl()
        this.chunks = []
        this.startedAt = Date.now()
        this.canvas = document.createElement('canvas')
        this.canvas.width = WIDTH
        this.canvas.height = HEIGHT

        this.localVideo = createVideo(localStream)
        const remotes = Array.isArray(remoteStreams) ? remoteStreams : [remoteStreams]
        const labels = remoteLabels ?? remotes.map((_, i) => remotes.length === 1 ? this.remoteLabel : `Remote ${i + 1}`)
        this.remoteVideos = remotes.map((stream, i) => ({
            video: createVideo(stream),
            label: labels[i]
        }))

        const audioTracks = this.mixAudio(localStream, remotes)
        const canvasCapture = this.canvas.captureStream?.(FPS)
        const videoTracks = canvasCapture?.getVideoTracks() ?? localStream.getVideoTracks()
        this.canvasStream = canvasCapture ?? makeStream(videoTracks)
        const composedStream = makeStream([...videoTracks, ...audioTracks])
        const mimeType = selectMimeType()
        const options = mimeType ? { mimeType } : undefined

        this.recorder = new MediaRecorder(composedStream, options)
        this.recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) this.chunks.push(event.data)
        }
        this.recorder.onstop = () => {
            this.closeAudioContext()
            this.stopCanvasTracks()
        }
        // Task 3 (Wave 4): handle runtime MediaRecorder errors
        this.recorder.onerror = () => {
            this._isRecording = false
            if (this.frameId != null) {
                cancelAnimationFrame(this.frameId)
                this.frameId = null
            }
            this.closeAudioContext()
            this.stopCanvasTracks()
            this.onError?.('Recording stopped due to an error.')
        }

        this._isRecording = true
        this.draw()
        this.recorder.start(1000)
    }

    async stop(): Promise<RecordingResult | null> {
        if (!this._isRecording) return null

        this._isRecording = false
        const durationMs = Math.max(0, Date.now() - this.startedAt)
        if (this.frameId != null) {
            cancelAnimationFrame(this.frameId)
            this.frameId = null
        }

        const recorder = this.recorder
        if (recorder) {
            try {
                recorder.stop()
            } catch {
                this.closeAudioContext()
                this.stopCanvasTracks()
            }
        } else {
            this.closeAudioContext()
            this.stopCanvasTracks()
        }

        const mimeType = recorder?.mimeType || selectMimeType() || 'video/webm'
        // Task 3 (Wave 4): if no chunks were captured, return null instead of an empty blob URL
        if (this.chunks.length === 0 || this.chunks.reduce((sum, b) => sum + b.size, 0) === 0) {
            return null
        }
        const blob = new Blob(this.chunks, { type: mimeType })
        this.objectUrl = typeof URL !== 'undefined' && URL.createObjectURL
            ? URL.createObjectURL(blob)
            : ''

        return { previewUrl: this.objectUrl, mimeType, durationMs }
    }

    cleanup(): void {
        if (this._isRecording) {
            void this.stop()
        } else {
            this.closeAudioContext()
            this.stopCanvasTracks()
        }
        this.cleanupObjectUrl()
        this.recorder = null
        this.canvas = null
        this.localVideo = null
        this.remoteVideos = []
        this.chunks = []
    }

    private mixAudio(localStream: MediaStream, remoteStreams: MediaStream[]): MediaStreamTrack[] {
        const audioTracks = [
            ...localStream.getAudioTracks(),
            ...remoteStreams.flatMap(s => s.getAudioTracks())
        ]
        if (audioTracks.length === 0) return []

        const AudioContextCtor = getAudioContextCtor()
        this.audioContext = new AudioContextCtor()
        const destination = this.audioContext.createMediaStreamDestination()
        for (const stream of [localStream, ...remoteStreams]) {
            if (stream.getAudioTracks().length === 0) continue
            this.audioContext.createMediaStreamSource(stream).connect(destination)
        }
        void this.audioContext.resume?.()
        return destination.stream.getAudioTracks?.() ?? []
    }

    private draw = (): void => {
        if (!this._isRecording || !this.canvas) return
        const ctx = this.canvas.getContext('2d')
        if (ctx) {
            ctx.fillStyle = '#111827'
            ctx.fillRect(0, 0, WIDTH, HEIGHT)

            const sharing = this.isScreenSharing?.() ?? false
            if (sharing) {
                const layout = computePresentationLayout(this.remoteVideos.length, WIDTH, HEIGHT)
                // The local stream carries the screen-share track during presentation
                // mode (mirrors GroupCallPage's own main + speaker tiles, both of
                // which render the local self-view while screen sharing).
                this.drawVideoOrPlaceholder(ctx, this.localVideo, layout.main.x, layout.main.y, layout.main.width, layout.main.height, this.localLabel)
                this.drawVideoOrPlaceholder(ctx, this.localVideo, layout.speaker.x, layout.speaker.y, layout.speaker.width, layout.speaker.height, this.localLabel)

                const thumbCount = Math.min(this.remoteVideos.length, layout.thumbnails.length)
                for (let i = 0; i < thumbCount; i++) {
                    const rect = layout.thumbnails[i]
                    const remote = this.remoteVideos[i]
                    this.drawVideoOrPlaceholder(ctx, remote.video, rect.x, rect.y, rect.width, rect.height, remote.label)
                }
            } else {
                const allVideos = [
                    { video: this.localVideo, label: this.localLabel },
                    ...this.remoteVideos
                ]
                const rects = computeGridLayout(allVideos.length, WIDTH, HEIGHT)
                allVideos.forEach((v, index) => {
                    const rect = rects[index]
                    if (!rect) return
                    this.drawVideoOrPlaceholder(ctx, v.video, rect.x, rect.y, rect.width, rect.height, v.label)
                })
            }
        }
        this.frameId = requestAnimationFrame(this.draw)
    }

    private drawVideoOrPlaceholder(
        ctx: CanvasRenderingContext2D,
        video: HTMLVideoElement | null,
        x: number,
        y: number,
        width: number,
        height: number,
        label: string,
    ): void {
        if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            ctx.drawImage(video, x, y, width, height)
            return
        }
        ctx.fillStyle = '#111827'
        ctx.fillRect(x, y, width, height)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
        ctx.font = '600 24px system-ui, sans-serif'
        ctx.fillText(label, x + 24, y + 42)
    }

    private closeAudioContext(): void {
        const context = this.audioContext
        this.audioContext = null
        if (context && context.state !== 'closed') {
            void context.close()
        }
    }

    private stopCanvasTracks(): void {
        this.canvasStream?.getTracks().forEach((track) => track.stop())
        this.canvasStream = null
    }

    private cleanupObjectUrl(): void {
        if (this.objectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
            URL.revokeObjectURL(this.objectUrl)
        }
        this.objectUrl = null
    }
}
