package com.vdt.webrtc.ws.message;

public record CallCancelReceived(String from, String callId) implements ServerMessage {
    
}
