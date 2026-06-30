package com.vdt.webrtc.room;

import java.util.List;

public record RoomSnapshot(
        String roomId,
        List<String> members) {
}