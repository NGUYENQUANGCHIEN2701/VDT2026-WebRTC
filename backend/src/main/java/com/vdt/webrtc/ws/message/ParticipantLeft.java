package com.vdt.webrtc.ws.message;

public record ParticipantLeft(
        String roomId,
        String username) implements ServerMessage {
}