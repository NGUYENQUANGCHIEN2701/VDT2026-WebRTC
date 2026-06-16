package com.vdt.webrtc.ws;

import java.util.Collection;

import org.springframework.web.socket.WebSocketSession;

import com.vdt.webrtc.ws.message.ServerMessage;

public interface MessageRouter {
    // local: lặp qua sessions truyền vào và gửi; Phase 6: PUBLISH lên Redis channel
    void broadcast(ServerMessage message, Collection<WebSocketSession> localSessions);

    void sendToUser(String userId, ServerMessage message); 
}
