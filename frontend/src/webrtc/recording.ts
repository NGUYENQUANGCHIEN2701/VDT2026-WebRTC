type RecordingControllerOptions = {
    callId?: string
    localLabel?: string
    remoteLabel?: string
    /** Task 3 (Wave 4): callback invoked if MediaRecorder fires an onerror event */
    onError?: (msg: string) => void
    /**
     * Quick task 260701-u3j: live reader for WHICH participant is the current
     * active sharer, polled every draw frame. Replaces the old boolean
     * `isScreenSharing` reader — a boolean can no longer tell the compositor
     * WHICH participant's video to draw into the presentation main/speaker
     * regions. 'local' selects the local video element; a string matching a
     * `remoteLabels` entry selects that remote's video element; null means no
     * one is sharing (falls back to grid mode).
     */
    getActiveSharer?: () => 'local' | string | null
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

/**
 * Quick task 260701-u3j: pure helper resolving which video element the
 * compositor should draw for the active sharer — local self-view, a named
 * remote participant's view (matched by label), or null if the named sharer
 * cannot be resolved (defensive: caller should have already treated
 * `sharer === null` as "not sharing" upstream, but an unresolvable remote
 * label should not crash the draw loop either).
 */
export function selectSharerVideo(
    sharer: 'local' | string | null,
    localVideo: HTMLVideoElement | null,
    remoteVideos: { video: HTMLVideoElement, label: string }[],
): HTMLVideoElement | null {
    if (sharer === null) return null
    if (sharer === 'local') return localVideo
    return remoteVideos.find((r) => r.label === sharer)?.video ?? null
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
    private getActiveSharer: (() => 'local' | string | null) | undefined

    constructor(options: RecordingControllerOptions = {}) {
        this.metadata = { callId: options.callId ?? '' }
        this.localLabel = options.localLabel ?? 'You'
        this.remoteLabel = options.remoteLabel ?? 'Remote'
        this.onError = options.onError
        this.getActiveSharer = options.getActiveSharer
    }

    get isRecording(): boolean {
        return this._isRecording
    }

    // replaceTrackInStream swaps tracks on the same MediaStream object, but some browsers
    // won't resume decoding without a forced srcObject reassignment (same fix as self-view).
    refreshLocalStream(localStream: MediaStream): void {
        if (!this._isRecording || !this.localVideo) return
        this.localVideo.srcObject = null
        this.localVideo.srcObject = localStream
        const playResult = this.localVideo.play()
        if (playResult && typeof playResult.catch === 'function') {
            playResult.catch(() => { })
        }
    }

    // Same fix as refreshLocalStream, for a remote peer's track replacement.
    refreshRemoteStream(label: string, stream: MediaStream): void {
        if (!this._isRecording) return
        const remote = this.remoteVideos.find((r) => r.label === label)
        if (!remote) return
        remote.video.srcObject = null
        remote.video.srcObject = stream
        const playResult = remote.video.play()
        if (playResult && typeof playResult.catch === 'function') {
            playResult.catch(() => { })
        }
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
            this.onError?.('Đã dừng ghi hình do gặp lỗi.')
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

            const sharer = this.getActiveSharer?.() ?? null
            const sharing = sharer !== null
            if (sharing) {
                // Bugfix (participant-bar-screen-share): a sharing remote peer's video
                // track is REPLACED in place (single-track architecture, no separate
                // camera track survives alongside the screen track), so their remoteVideos
                // entry now carries the same screen content already drawn into main/speaker.
                // Excluding them here keeps the recording's thumbnail strip in parity with
                // the on-screen GroupCallPage.tsx thumbnailMembers filtering (established
                // live/recording layout-parity invariant from quick-task 260701-tkz).
                const thumbnailVideos = this.remoteVideos.filter((r) => r.label !== sharer)
                const layout = computePresentationLayout(thumbnailVideos.length, WIDTH, HEIGHT)

                // Draw the screen share into the large main region.
                const sharerVideo = selectSharerVideo(sharer, this.localVideo, this.remoteVideos)
                const sharerLabel = sharer === 'local'
                    ? this.localLabel
                    : (this.remoteVideos.find((r) => r.label === sharer)?.label ?? this.localLabel)
                this.drawVideoOrPlaceholder(ctx, sharerVideo, layout.main.x, layout.main.y, layout.main.width, layout.main.height, sharerLabel)

                // Bugfix (recording-overexpose): speaker slot previously drew the sharer
                // video a second time (double-composite → overexposure/washed-out).
                // Draw the LOCAL self-view camera in the speaker slot instead — this matches
                // what the on-screen GroupCallPage UI actually shows (PiP of local camera
                // while the screen share fills the main area).
                // When the local participant IS the sharer, skip the speaker slot entirely
                // (no separate camera feed is available).
                if (sharer !== 'local') {
                    this.drawVideoOrPlaceholder(ctx, this.localVideo, layout.speaker.x, layout.speaker.y, layout.speaker.width, layout.speaker.height, this.localLabel)
                }

                const thumbCount = Math.min(thumbnailVideos.length, layout.thumbnails.length)
                for (let i = 0; i < thumbCount; i++) {
                    const rect = layout.thumbnails[i]
                    const remote = thumbnailVideos[i]
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

    /**
     * Draw a video element (or a dark placeholder) into a canvas rect using
     * object-fit:cover semantics — the video fills the slot without stretching,
     * cropping from the centre when the aspect ratio differs.
     *
     * Using cover (instead of plain drawImage stretch) prevents dark letterbox
     * bars from bleeding into adjacent regions, which was a secondary contributor
     * to the washed-out appearance when black bars overlapped bright video tiles.
     */
    private drawVideoOrPlaceholder(
        ctx: CanvasRenderingContext2D,
        video: HTMLVideoElement | null,
        x: number,
        y: number,
        width: number,
        height: number,
        label: string,
    ): void {
        // Per-tile background — prevents canvas bleed-through between adjacent tiles.
        ctx.fillStyle = '#111827'
        ctx.fillRect(x, y, width, height)

        if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            && video.videoWidth > 0 && video.videoHeight > 0) {
            // Cover-fit: scale to fill the slot, crop from the centre.
            const vw = video.videoWidth
            const vh = video.videoHeight
            const scale = Math.max(width / vw, height / vh)
            const sw = width / scale   // source crop width
            const sh = height / scale  // source crop height
            const sx = (vw - sw) / 2   // centre horizontally
            const sy = (vh - sh) / 2   // centre vertically

            ctx.save()
            ctx.beginPath()
            ctx.rect(x, y, width, height)
            ctx.clip()
            ctx.drawImage(video, sx, sy, sw, sh, x, y, width, height)
            ctx.restore()
        } else {
            // Placeholder: label centered in the slot.
            ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
            ctx.font = '600 24px system-ui, sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText(label, x + width / 2, y + height / 2)
            ctx.textAlign = 'left' // restore default
        }

        // Label pill — semi-transparent background so text is legible without
        // brightening the video area.
        const PILL_H = 28
        const PILL_PAD = 10
        ctx.font = '500 13px system-ui, sans-serif'
        const tw = ctx.measureText(label).width
        const pillW = tw + PILL_PAD * 2
        const pillX = x + 10
        const pillY = y + height - PILL_H - 10
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
        ctx.beginPath()
        ctx.roundRect(pillX, pillY, pillW, PILL_H, 6)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, pillX + PILL_PAD, pillY + PILL_H - 8)
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
