package com.vdt.webrtc.ws.message;

public record RoomInviteDeclined(String roomId, String username) implements ServerMessage {
}
