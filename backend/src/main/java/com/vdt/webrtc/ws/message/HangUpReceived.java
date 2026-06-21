package com.vdt.webrtc.ws.message;

public record HangUpReceived(String from, String callId) implements ServerMessage {
    
}
