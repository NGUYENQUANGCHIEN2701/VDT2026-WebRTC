package com.vdt.webrtc.ws;

import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.vdt.webrtc.presence.PresenceService;
import com.vdt.webrtc.ws.message.CallOffer;
import com.vdt.webrtc.ws.message.CallOfferReceived;
import com.vdt.webrtc.ws.message.ClientMessage;
import com.vdt.webrtc.ws.message.Ping;
import com.vdt.webrtc.ws.message.Pong;
import com.vdt.webrtc.ws.message.PresenceSnapshot;
import com.vdt.webrtc.ws.message.SessionSuperseded;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
public class PresenceWebSocketHandler extends TextWebSocketHandler {
    private final PresenceService presence;
    private final MessageRouter router;
    private final ObjectMapper mapper;

    private final SessionRegistry sessionRegistry;

    public PresenceWebSocketHandler(PresenceService presence, MessageRouter router, ObjectMapper mapper,
            SessionRegistry sessionRegistry) {
        this.presence = presence;
        this.router = router;
        this.mapper = mapper;
        this.sessionRegistry = sessionRegistry;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String username = username(session);
        WebSocketSession old = sessionRegistry.register(username, session);
        if (old != null && old.isOpen() && !old.getId().equals(session.getId())) {
            router.broadcast(new SessionSuperseded("Đăng nhập ở nơi khác"), List.of(old));
            old.close(new CloseStatus(4001, "superseded"));
        }
        presence.join(username);
        broadcastSnapshot();
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String username = username(session);
        ClientMessage clientMessage = mapper.readValue(message.getPayload(), ClientMessage.class);
        if (clientMessage instanceof Ping) {
            presence.heartbeat(username);
            router.broadcast(new Pong(), List.of(session));
        } else if (clientMessage instanceof CallOffer offer) {
            // from = username (từ token), KHÔNG tin body → chống spoof
            CallOfferReceived received = new CallOfferReceived(username, offer.callId());
            router.sendToUser(offer.to(), received);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String username = username(session);
        if (sessionRegistry.deregister(username, session)) {
            presence.leave(username);
            broadcastSnapshot();
        }
    }

    public void broadcastSnapshot() {
        PresenceSnapshot snapshot = new PresenceSnapshot(presence.snapshot());
        router.broadcast(snapshot, sessionRegistry.all());
    }

    private String username(WebSocketSession session) {
        return (String) session.getAttributes().get("username");
    }
}
