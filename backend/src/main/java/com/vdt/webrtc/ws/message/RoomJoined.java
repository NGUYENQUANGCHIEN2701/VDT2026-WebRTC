package com.vdt.webrtc.ws.message;

import java.util.List;

public record RoomJoined(String roomId, List<String> members) implements ServerMessage {

}
