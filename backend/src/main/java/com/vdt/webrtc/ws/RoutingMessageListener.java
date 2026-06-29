package com.vdt.webrtc.ws;

import java.io.IOException;

import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
public class RoutingMessageListener implements MessageListener {
    private final ObjectMapper objectMapper;
    private final SessionRegistry sessionRegistry;

    public RoutingMessageListener(ObjectMapper objectMapper, SessionRegistry sessionRegistry) {
        this.objectMapper = objectMapper;
        this.sessionRegistry = sessionRegistry;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        RoutedEnvelope envelope;
        try {
            envelope = objectMapper.readValue(message.getBody(), RoutedEnvelope.class);
        } catch (JacksonException e) {
            log.error("Không deserialize được message", e);
            return; // hỏng từ gốc thì khỏi gửi ai
        }
        sessionRegistry.get(envelope.userId()).ifPresent(session -> {
            try {
                synchronized (session) { // sendMessage không thread-safe — serialize ghi theo từng session
                    if (session.isOpen()) {
                        session.sendMessage(new TextMessage(envelope.payload()));
                    }
                }
            } catch (IOException e) {
                log.warn("Gửi thất bại tới session {}", session.getId(), e);
            }
        });
    }

}
