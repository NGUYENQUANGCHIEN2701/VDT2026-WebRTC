package com.vdt.webrtc.ws.message;

public record CallReject(String to, String callId) implements ClientMessage {
    
}
