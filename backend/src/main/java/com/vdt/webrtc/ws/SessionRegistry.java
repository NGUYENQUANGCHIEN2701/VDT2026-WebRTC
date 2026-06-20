package com.vdt.webrtc.ws;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

@Component
public class SessionRegistry {

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    // Đăng ký user → session. TRẢ session cũ (nếu user đã có kết nối trước) để
    // handler kick nó.
    public WebSocketSession register(String userId, WebSocketSession session) {
        return sessions.put(userId, session);
    }

    // Gỡ đúng CẶP (userId, session). Dùng remove 2 tham số.
    // Trả boolean: true nếu đúng session này bị gỡ (để handler chỉ leave/broadcast khi đúng).
    public boolean deregister(String userId, WebSocketSession session) {
        return sessions.remove(userId, session);
    }

    // Tra session của 1 user. Trả Optional để bên gọi xử lý "offline".
    public Optional<WebSocketSession> get(String userId) {
        return Optional.ofNullable(sessions.get(userId));
    }

    // Tất cả session đang mở — cho broadcast.
    public Collection<WebSocketSession> all() {
        return sessions.values();
    }

}
