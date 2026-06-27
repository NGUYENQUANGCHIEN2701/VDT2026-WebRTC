package com.vdt.webrtc.ws.message;

public record MediaState(String to, boolean micMuted, boolean camOff) implements ClientMessage {
    
}
