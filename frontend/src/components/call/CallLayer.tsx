import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCallStore } from '../../store/callStore'
import { acceptCall, rejectCall, cancelCall, getLocalStream } from '../../realtime/callActions'
import IncomingCallCard from './IncomingCallCard'
import SelfViewPreview from './SelfViewPreview'

const IN_CALL = ['connecting', 'connected', 'reconnecting', 'failed']

export default function CallLayer() {
    const navigate = useNavigate()
    const location = useLocation()
    const callState = useCallStore((s) => s.callState)
    const remoteUserId = useCallStore((s) => s.remoteUserId)
    const mediaMode = useCallStore((s) => s.mediaMode)
    const mediaError = useCallStore((s) => s.mediaError)

    // Điều hướng theo state: vào cuộc gọi → /call; idle → về Home
    useEffect(() => {
        if (IN_CALL.includes(callState) && location.pathname !== '/call') {
            navigate('/call')
        } else if (callState === 'idle' && location.pathname === '/call') {
            navigate('/')
        }
    }, [callState, location.pathname, navigate])

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
