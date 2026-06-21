package com.vdt.webrtc.ws.message;

public record CallCancel(String to, String callId) implements ClientMessage {
    
}
