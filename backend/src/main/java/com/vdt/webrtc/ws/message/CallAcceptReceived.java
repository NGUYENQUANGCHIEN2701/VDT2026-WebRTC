package com.vdt.webrtc.ws.message;

public record CallAcceptReceived(String from, String callId) implements ServerMessage {
    
}
