package com.vdt.webrtc.ws;

import java.io.IOException;
import java.util.Collection;

import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import com.vdt.webrtc.ws.message.ServerMessage;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Primary
@Service
@Slf4j
public class RedisMessageRouter implements MessageRouter {
    private final ObjectMapper mapper;
    private final SessionRegistry sessionRegistry;
    private final StringRedisTemplate redisTemplate;

    public RedisMessageRouter(ObjectMapper mapper, SessionRegistry sessionRegistry, StringRedisTemplate redisTemplate) {
        this.mapper = mapper;
        this.sessionRegistry = sessionRegistry;
        this.redisTemplate = redisTemplate;
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
        sessionRegistry.get(userId).ifPresentOrElse(session -> {
            String json;
            try {
                json = mapper.writeValueAsString(message);
            } catch (JacksonException e) {
                log.error("Không serialize được message", e);
                return; // hỏng từ gốc thì khỏi gửi ai
            }

            try {
                synchronized (session) { // sendMessage không thread-safe — serialize ghi theo từng session
                    if (session.isOpen()) {
                        session.sendMessage(new TextMessage(json));
                    }
                }
            } catch (IOException e) {
                log.warn("Gửi thất bại tới session {}", session.getId(), e);
            }
        },
                () -> {
                    String targetInstance = redisTemplate.opsForValue().get("route:" + userId);
                    if (targetInstance == null) {
                        log.warn("User {} không có route — offline?", userId);
                        return; // return này thoát khỏi lambda, ok
                    }
                    try {
                        String payload = mapper.writeValueAsString(message); // (a) message → JSON
                        String wire = mapper.writeValueAsString(new RoutedEnvelope(userId, payload)); // (b) phong bì →
                                                                                                      // JSON
                        redisTemplate.convertAndSend("inst:" + targetInstance, wire); // gửi lên kênh instance đích
                    } catch (JacksonException e) {
                        log.error("Không serialize được envelope", e);
                    }
                });

    }
}
