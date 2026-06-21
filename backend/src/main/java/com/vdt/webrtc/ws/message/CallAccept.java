package com.vdt.webrtc.ws.message;

public record CallAccept(String to, String callId) implements ClientMessage {
    
}
