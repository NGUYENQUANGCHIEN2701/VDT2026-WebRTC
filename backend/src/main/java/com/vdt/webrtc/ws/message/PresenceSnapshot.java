package com.vdt.webrtc.ws.message;

import java.util.List;

public record PresenceSnapshot(List<OnlineUser> users) implements ServerMessage {
    
}
