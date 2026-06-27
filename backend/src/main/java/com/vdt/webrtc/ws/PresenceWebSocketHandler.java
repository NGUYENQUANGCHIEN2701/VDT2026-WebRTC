package com.vdt.webrtc.ws;

import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.vdt.webrtc.call.CallService;
import com.vdt.webrtc.presence.PresenceService;
import com.vdt.webrtc.ws.message.CallAccept;
import com.vdt.webrtc.ws.message.CallCancel;
import com.vdt.webrtc.ws.message.CallInvite;
import com.vdt.webrtc.ws.message.CallReject;
import com.vdt.webrtc.ws.message.ClientMessage;
import com.vdt.webrtc.ws.message.HangUp;
import com.vdt.webrtc.ws.message.IceCandidateMessage;
import com.vdt.webrtc.ws.message.IceCandidateReceived;
import com.vdt.webrtc.ws.message.Ping;
import com.vdt.webrtc.ws.message.Pong;
import com.vdt.webrtc.ws.message.PresenceSnapshot;
import com.vdt.webrtc.ws.message.SdpMessage;
import com.vdt.webrtc.ws.message.SdpReceived;
import com.vdt.webrtc.ws.message.SessionSuperseded;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
public class PresenceWebSocketHandler extends TextWebSocketHandler {
    private final PresenceService presence;
    private final MessageRouter router;
    private final ObjectMapper mapper;
    private final CallService callService;
    private final SessionRegistry sessionRegistry;

    public PresenceWebSocketHandler(PresenceService presence, MessageRouter router, ObjectMapper mapper,
            CallService callService, SessionRegistry sessionRegistry) {
        this.presence = presence;
        this.router = router;
        this.mapper = mapper;
        this.callService = callService;
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
        } else if (clientMessage instanceof CallInvite invite) {
            callService.handleInvite(username, invite.to());
        } else if (clientMessage instanceof CallAccept accept) {
            callService.handleAccept(username, accept.callId());
        } else if (clientMessage instanceof CallReject reject) {
            callService.handleReject(username, reject.callId());
        } else if (clientMessage instanceof CallCancel cancel) {
            callService.handleCancel(username, cancel.callId());
        } else if (clientMessage instanceof HangUp hangUp) {
            callService.handleHangUp(username, hangUp.callId());
        } else if (clientMessage instanceof SdpMessage sdpMessage) {
            SdpReceived received = new SdpReceived(username, sdpMessage.callId(), sdpMessage.sdp());
            router.sendToUser(sdpMessage.to(), received);
        } else if (clientMessage instanceof IceCandidateMessage iceCandidateMessage) {
            IceCandidateReceived received = new IceCandidateReceived(username, iceCandidateMessage.callId(),
                    iceCandidateMessage.candidate());
            router.sendToUser(iceCandidateMessage.to(), received);
        } else {
            log.warn("Unknown message type: {}", clientMessage.getClass().getName());
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
