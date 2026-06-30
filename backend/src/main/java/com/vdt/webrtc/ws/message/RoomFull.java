package com.vdt.webrtc.ws.message;

public record RoomFull(
        String roomId,
        String reason) implements ServerMessage {
}