package com.vdt.webrtc.ws.message;

// state: "ringing" | "active" | "ended"; reason: null khi chưa kết thúc
public record CallStateChanged(
        String callId,
        String state,
        String reason,
        String callerId,
        String calleeId) implements ServerMessage {
}
