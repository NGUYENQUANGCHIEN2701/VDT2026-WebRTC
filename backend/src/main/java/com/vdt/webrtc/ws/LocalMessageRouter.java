package com.vdt.webrtc.ws;

import java.io.IOException;
import java.util.Collection;

import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import com.vdt.webrtc.ws.message.ServerMessage;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class LocalMessageRouter implements MessageRouter {

    private final ObjectMapper mapper;
    private final SessionRegistry sessionRegistry;
    public LocalMessageRouter(ObjectMapper mapper, SessionRegistry sessionRegistry) {
        this.mapper = mapper;
        this.sessionRegistry = sessionRegistry;
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
        String json;
        try {
            json = mapper.writeValueAsString(message);
        } catch (JacksonException e) {
            log.error("Không serialize được message", e);
            return; // hỏng từ gốc thì khỏi gửi ai
        }

        TextMessage textMessage = new TextMessage(json);
        sessionRegistry.get(userId).ifPresentOrElse(session -> {
            try {
                synchronized (session) {
                    if (session.isOpen()) {
                        session.sendMessage(textMessage);
                    }
                }
            } catch (IOException e) {
                log.warn("Gửi thất bại tới user {}", userId, e);
            }
        }, () -> {
            log.warn("User {} không tồn tại hoặc không hoạt động", userId);
        });
    }
}
