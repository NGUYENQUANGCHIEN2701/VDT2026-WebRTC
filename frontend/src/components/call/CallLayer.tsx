import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCallStore } from '../../store/callStore'
import { acceptCall, rejectCall, cancelCall, getLocalStream, readSavedCall, clearSavedCall, getActivePeer } from '../../realtime/callActions'
import IncomingCallCard from './IncomingCallCard'
import SelfViewPreview from './SelfViewPreview'
import CallSummaryScreen from './CallSummaryScreen'

const IN_CALL = ['connecting', 'connected', 'reconnecting', 'failed']

export default function CallLayer() {
    const navigate = useNavigate()
    const location = useLocation()
    const callState = useCallStore((s) => s.callState)
    const remoteUserId = useCallStore((s) => s.remoteUserId)
    const mediaMode = useCallStore((s) => s.mediaMode)
    const mediaError = useCallStore((s) => s.mediaError)
    const endReason = useCallStore((s) => s.endReason)
    const durationMs = useCallStore((s) => s.durationMs)
    const reset = useCallStore((s) => s.reset)

    // FE-C: vừa F5 giữa cuộc → hiện overlay "đang kết nối lại" NGAY, chờ server resync.
    // Đường BÌNH THƯỜNG: WS nối lại → server gửi 'active' (còn grace) HOẶC 'ended/dropped'
    // (quá grace) → 2 message này tự lái FE, bail không đụng tới.
    // Bail chỉ là lưới an toàn cho trường hợp WS KHÔNG BAO GIỜ nối lại (offline hẳn).
    // Phải DÀI HƠN backend grace (CALL_GRACE_PERIOD_SECONDS, mặc định 15s) + đệm nối lại,
    // nếu không sẽ bỏ cuộc oan trong khi server vẫn còn cứu được.
    useEffect(() => {
        const saved = readSavedCall()
        if (!saved || useCallStore.getState().callState !== 'idle') return
        const call = useCallStore.getState()
        call.startIncoming(saved.remote, saved.callId) // tạm điền context (remote/callId)
        call.setCallState('reconnecting')              // → CallPage hiện overlay
        const bail = setTimeout(() => {
            const c = useCallStore.getState()
            if (c.callState === 'reconnecting' && getActivePeer() == null) {
                clearSavedCall()
                c.reset()
            }
        }, 20_000)
        return () => clearTimeout(bail)
    }, [])

    // Điều hướng theo state: vào cuộc gọi → /call; idle → về Home
    useEffect(() => {
        if (IN_CALL.includes(callState) && location.pathname !== '/call') {
            navigate('/call')
        } else if (callState === 'idle' && location.pathname === '/call') {
            navigate('/')
        }
    }, [callState, location.pathname, navigate])

    if (callState === 'ended' && endReason) {
        return <CallSummaryScreen reason={endReason} durationMs={durationMs} onClose={reset} />
    }
    if (callState === 'incoming' && remoteUserId) {
        return <IncomingCallCard callerUsername={remoteUserId} onAccept={acceptCall} onReject={rejectCall} />
    }
    if (callState === 'outgoing' && remoteUserId) {
        return (
            <SelfViewPreview
                remoteUsername={remoteUserId}
                localStream={getLocalStream()}
                mediaError={mediaError}
                mode={mediaMode}
                onCancel={cancelCall}
            />
        )
    }
    return null
}
