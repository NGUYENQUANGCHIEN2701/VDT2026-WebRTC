type RecordingControllerOptions = {
    callId?: string
    localLabel?: string
    remoteLabel?: string
}

type RecordingResult = {
    previewUrl: string
    mimeType: string
    durationMs: number
}

const WIDTH = 1280
const HEIGHT = 720
const FPS = 30

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
    private canvas: HTMLCanvasElement | null = null
    private canvasStream: MediaStream | null = null
    private localVideo: HTMLVideoElement | null = null
    private remoteVideo: HTMLVideoElement | null = null
    private audioContext: AudioContext | null = null
    private recorder: MediaRecorder | null = null
    private chunks: Blob[] = []
    private frameId: number | null = null
    private startedAt = 0
    private objectUrl: string | null = null
    private _isRecording = false

    constructor(options: RecordingControllerOptions = {}) {
        this.metadata = { callId: options.callId ?? '' }
        this.localLabel = options.localLabel ?? 'You'
        this.remoteLabel = options.remoteLabel ?? 'Remote'
    }

    get isRecording(): boolean {
        return this._isRecording
    }

    start(localStream: MediaStream, remoteStream: MediaStream, callId?: string): void {
        if (this._isRecording) return
        if (callId) this.metadata.callId = callId

        this.cleanupObjectUrl()
        this.chunks = []
        this.startedAt = Date.now()
        this.canvas = document.createElement('canvas')
        this.canvas.width = WIDTH
        this.canvas.height = HEIGHT

        this.localVideo = createVideo(localStream)
        this.remoteVideo = createVideo(remoteStream)

        const audioTracks = this.mixAudio(localStream, remoteStream)
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
        this.remoteVideo = null
        this.chunks = []
    }

    private mixAudio(localStream: MediaStream, remoteStream: MediaStream): MediaStreamTrack[] {
        const audioTracks = [...localStream.getAudioTracks(), ...remoteStream.getAudioTracks()]
        if (audioTracks.length === 0) return []

        const AudioContextCtor = getAudioContextCtor()
        this.audioContext = new AudioContextCtor()
        const destination = this.audioContext.createMediaStreamDestination()
        for (const stream of [localStream, remoteStream]) {
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
            this.drawVideoOrPlaceholder(ctx, this.remoteVideo, 0, 0, WIDTH, HEIGHT, this.remoteLabel)
            const pipWidth = Math.round(WIDTH * 0.24)
            const pipHeight = Math.round((pipWidth / 16) * 9)
            const pipX = WIDTH - pipWidth - 32
            const pipY = HEIGHT - pipHeight - 32
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
            ctx.fillRect(pipX - 6, pipY - 6, pipWidth + 12, pipHeight + 12)
            this.drawVideoOrPlaceholder(ctx, this.localVideo, pipX, pipY, pipWidth, pipHeight, this.localLabel)
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
