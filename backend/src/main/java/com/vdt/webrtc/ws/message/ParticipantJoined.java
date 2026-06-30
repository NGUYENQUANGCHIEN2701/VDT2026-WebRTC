package com.vdt.webrtc.ws.message;

public record ParticipantJoined(
        String roomId,
        String username) implements ServerMessage {
}