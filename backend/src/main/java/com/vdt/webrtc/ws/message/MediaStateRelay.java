package com.vdt.webrtc.ws.message;

public record MediaStateRelay(String from, boolean micMuted, boolean camOff, boolean isScreenSharing) implements ServerMessage {

}
