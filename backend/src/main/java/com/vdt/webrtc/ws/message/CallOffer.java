package com.vdt.webrtc.ws.message;

public record CallOffer(String to, String callId) implements ClientMessage {
    
}
