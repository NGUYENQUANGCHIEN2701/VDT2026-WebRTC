package com.vdt.webrtc.ws.message;

import java.util.List;

public record RoomInvite (
        String roomId,
        String from,
        List<String> invitees) implements ServerMessage {

}
