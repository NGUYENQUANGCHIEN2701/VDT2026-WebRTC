package com.vdt.webrtc.call;

public record CallSnapshot(
        String callId,
        String state,
        String reason,
        String callerId,
        String calleeId) {
}
