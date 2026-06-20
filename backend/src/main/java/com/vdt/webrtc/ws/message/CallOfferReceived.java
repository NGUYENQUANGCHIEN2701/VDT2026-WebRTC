package com.vdt.webrtc.ws.message;

public record CallOfferReceived(String from, String callId) implements ServerMessage {
}
