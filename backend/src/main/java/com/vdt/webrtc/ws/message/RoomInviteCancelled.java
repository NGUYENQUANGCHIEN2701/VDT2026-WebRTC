package com.vdt.webrtc.ws.message;

import com.fasterxml.jackson.annotation.JsonTypeName;

@JsonTypeName("room-invite-cancelled")
public record RoomInviteCancelled(String roomId) implements ServerMessage {
}
