package com.vdt.webrtc.ws;

import java.io.IOException;
import java.util.Collection;

import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import com.vdt.webrtc.ws.message.ServerMessage;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class LocalMessageRouter implements MessageRouter {

    private final ObjectMapper mapper;

    public LocalMessageRouter(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void broadcast(ServerMessage message, Collection<WebSocketSession> localSessions) {
        String json;
        try {
            json = mapper.writeValueAsString(message);
        } catch (JacksonException e) {
            log.error("Không serialize được message", e);
            return; // hỏng từ gốc thì khỏi gửi ai
        }

        TextMessage textMessage = new TextMessage(json);
        for (WebSocketSession session : localSessions) {
            try {
                synchronized (session) { // sendMessage không thread-safe — serialize ghi theo từng session
                    if (session.isOpen()) {
                        session.sendMessage(textMessage);
                    }
                }
            } catch (IOException e) {
                log.warn("Gửi thất bại tới session {}", session.getId(), e);
            }
        }
    }

    @Override
    public void sendToUser(String userId, ServerMessage message) {
        throw new UnsupportedOperationException("sendToUser: để dành Phase 3 signaling");
    }
}
