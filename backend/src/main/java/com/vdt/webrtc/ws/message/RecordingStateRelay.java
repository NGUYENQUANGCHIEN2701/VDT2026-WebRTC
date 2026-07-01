package com.vdt.webrtc.ws.message;

public record RecordingStateRelay(String from, String callId, boolean recording) implements ServerMessage {
}