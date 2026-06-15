package com.vdt.webrtc.ws.message;

import com.vdt.webrtc.presence.PresenceStatus;

public record OnlineUser(String username, PresenceStatus status) {
    
}
