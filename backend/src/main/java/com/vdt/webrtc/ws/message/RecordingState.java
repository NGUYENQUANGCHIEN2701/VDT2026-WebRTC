package com.vdt.webrtc.ws.message;

public record RecordingState(String callId, String to, boolean recording) implements ClientMessage {
}