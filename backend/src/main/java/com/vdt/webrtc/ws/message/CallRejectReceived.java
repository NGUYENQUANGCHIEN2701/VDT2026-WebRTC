package com.vdt.webrtc.ws.message;

public record CallRejectReceived(String from, String callId) implements ServerMessage {
    
}
