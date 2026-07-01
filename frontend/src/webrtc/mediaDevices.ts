const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
}

export async function enumerateMediaDevices(): Promise<MediaDeviceInfo[]> {
    return navigator.mediaDevices.enumerateDevices()
}

export async function acquireVideoTrack(deviceId?: string): Promise<MediaStreamTrack> {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
    })
    const track = stream.getVideoTracks()[0]
    if (!track) throw new DOMException('No video track returned', 'NotFoundError')
    return track
}

export async function acquireAudioTrack(deviceId?: string): Promise<MediaStreamTrack> {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
            ...AUDIO_CONSTRAINTS,
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
    })
    const track = stream.getAudioTracks()[0]
    if (!track) throw new DOMException('No audio track returned', 'NotFoundError')
    return track
}

export function replaceTrackInStream(
    stream: MediaStream,
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack,
): void {
    stream.removeTrack(oldTrack)
    stream.addTrack(newTrack)
}

export function stopTrack(track: MediaStreamTrack | null | undefined): void {
    track?.stop()
}

export function getCurrentTrack(
    stream: MediaStream,
    kind: 'video' | 'audio',
): MediaStreamTrack | null {
    return kind === 'video'
        ? stream.getVideoTracks()[0] ?? null
        : stream.getAudioTracks()[0] ?? null
}
