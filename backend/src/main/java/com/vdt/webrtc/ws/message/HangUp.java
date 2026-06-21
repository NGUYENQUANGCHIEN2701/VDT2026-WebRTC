package com.vdt.webrtc.ws.message;

public record HangUp(String to, String callId) implements ClientMessage {
    
}
