import { useEffect, useRef } from 'react'
import { useCallStore } from '../../store/callStore'
import { useRoomStore } from '../../store/roomStore'

export default function Ringtone() {
    const callState = useCallStore((s) => s.callState)
    const incomingInvite = useRoomStore((s) => s.incomingInvite)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        if (callState === 'incoming' || incomingInvite != null) {
            audio.currentTime = 0
            audio.play().catch(() => { })   // autoplay có thể bị chặn → nuốt lỗi
        } else {
            audio.pause()                  // accept/reject/timeout → dừng
        }
    }, [callState, incomingInvite])

    return <audio ref={audioRef} src="/ringtone.mp3" loop preload="auto" />
}
