import { useEffect, useRef } from 'react'
import { useCallStore } from '../../store/callStore'

export default function Ringtone() {
    const callState = useCallStore((s) => s.callState)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        if (callState === 'incoming') {
            audio.currentTime = 0
            audio.play().catch(() => { })   // autoplay có thể bị chặn → nuốt lỗi
        } else {
            audio.pause()                  // accept/reject/timeout → dừng
        }
    }, [callState])

    return <audio ref={audioRef} src="/ringtone.mp3" loop preload="auto" />
}
