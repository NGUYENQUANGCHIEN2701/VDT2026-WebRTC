package com.vdt.webrtc.ws;

import java.time.Duration;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.vdt.webrtc.call.CallService;
import com.vdt.webrtc.presence.PresenceService;
import com.vdt.webrtc.room.RoomService;
import com.vdt.webrtc.ws.message.CallAccept;
import com.vdt.webrtc.ws.message.CallCancel;
import com.vdt.webrtc.ws.message.CallInvite;
import com.vdt.webrtc.ws.message.CallReject;
import com.vdt.webrtc.ws.message.CancelGroupInvite;
import com.vdt.webrtc.ws.message.ClientMessage;
import com.vdt.webrtc.ws.message.DeclineRoomInvite;
import com.vdt.webrtc.ws.message.GroupInvite;
import com.vdt.webrtc.ws.message.HangUp;
import com.vdt.webrtc.ws.message.IceCandidateMessage;
import com.vdt.webrtc.ws.message.IceCandidateReceived;
import com.vdt.webrtc.ws.message.JoinRoom;
import com.vdt.webrtc.ws.message.LeaveRoom;
import com.vdt.webrtc.ws.message.MediaState;
import com.vdt.webrtc.ws.message.MediaStateRelay;
import com.vdt.webrtc.ws.message.Ping;
import com.vdt.webrtc.ws.message.Pong;
import com.vdt.webrtc.ws.message.PresenceSnapshot;
import com.vdt.webrtc.ws.message.RecordingState;
import com.vdt.webrtc.ws.message.RecordingStateRelay;
import com.vdt.webrtc.ws.message.SdpMessage;
import com.vdt.webrtc.ws.message.SdpReceived;
import com.vdt.webrtc.ws.message.SessionSuperseded;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
public class PresenceWebSocketHandler extends TextWebSocketHandler {
    private final PresenceService presence;
    private final MessageRouter router;
    private final ObjectMapper mapper;
    private final CallService callService;
    private final SessionRegistry sessionRegistry;
    private final StringRedisTemplate redisTemplate;
    private static final long ROUTE_TTL_SECONDS = 60;
    private final String instanceId;
    private final RoomService roomService;

    public PresenceWebSocketHandler(PresenceService presence, MessageRouter router, ObjectMapper mapper,
            CallService callService, SessionRegistry sessionRegistry, StringRedisTemplate redisTemplate,
            RoomService roomService,
            @Value("${app.instance-id:${HOSTNAME:unknown}}") String instanceId) {
        this.presence = presence;
        this.router = router;
        this.mapper = mapper;
        this.callService = callService;
        this.sessionRegistry = sessionRegistry;
        this.redisTemplate = redisTemplate;
        this.instanceId = instanceId;
        this.roomService = roomService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String username = username(session);

        String existing = redisTemplate.opsForValue().get("route:" + username);
        if (existing != null && !existing.equals(instanceId)) {
            // user đang có phiên ở instance KHÁC → bảo instance đó kick phiên cũ
            try {
                String payload = mapper.writeValueAsString(new SessionSuperseded("Đăng nhập ở nơi khác"));
                redisTemplate.convertAndSend("inst:" + existing,
                        mapper.writeValueAsString(new RoutedEnvelope(username, payload)));
            } catch (JacksonException e) {
                log.error("Không serialize được session-superseded", e);
            }
        }

        WebSocketSession old = sessionRegistry.register(username, session);
        if (old != null && old.isOpen() && !old.getId().equals(session.getId())) {
            router.broadcast(new SessionSuperseded("Đăng nhập ở nơi khác"), List.of(old));
            old.close(new CloseStatus(4001, "superseded"));
        }
        presence.join(username);
        redisTemplate.opsForValue().set("route:" + username, instanceId, Duration.ofSeconds(ROUTE_TTL_SECONDS));
        // Đẩy snapshot ĐỒNG BỘ cho riêng session vừa kết nối: người mới phải thấy
        // danh sách online ngay, không phụ thuộc đường async presence-events (vốn chỉ
        // refresh các client đã online sẵn). Các instance khác được join() ở trên
        // publish presence-events lo.
        router.broadcast(new PresenceSnapshot(presence.snapshot()), List.of(session));
        callService.handleReconnect(username);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String username = username(session);
        ClientMessage clientMessage = mapper.readValue(message.getPayload(), ClientMessage.class);
        if (clientMessage instanceof Ping) {
            presence.heartbeat(username);
            redisTemplate.expire("route:" + username, Duration.ofSeconds(ROUTE_TTL_SECONDS));
            router.broadcast(new Pong(), List.of(session));
        } else if (clientMessage instanceof GroupInvite invite) {
            roomService.handleGroupInvite(username, invite.to());
        } else if (clientMessage instanceof CancelGroupInvite cancel) {
            roomService.handleCancelGroupInvite(username, cancel.to());
        } else if (clientMessage instanceof JoinRoom join) {
            roomService.handleJoin(username, join.roomId());
        } else if (clientMessage instanceof LeaveRoom leave) {
            roomService.handleLeave(username, leave.roomId());
        } else if (clientMessage instanceof DeclineRoomInvite decline) {
            roomService.handleDecline(username, decline.roomId());
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
        } else if (clientMessage instanceof MediaState ms) {
            String roomId = roomService.roomOf(username);
            if (roomId == null) {
                // Không ở trong room nào → đây là 1-1 CallService MediaState path, giữ nguyên hành vi cũ.
                router.sendToUser(ms.to(), new MediaStateRelay(username, ms.micMuted(), ms.camOff(), ms.isScreenSharing()));
            } else if (ms.isScreenSharing()) {
                boolean claimed = roomService.claimOrRejectScreenShare(roomId, username);
                router.sendToUser(ms.to(), new MediaStateRelay(username, ms.micMuted(), ms.camOff(), claimed));
            } else {
                roomService.releaseScreenShareIfHeld(roomId, username);
                router.sendToUser(ms.to(), new MediaStateRelay(username, ms.micMuted(), ms.camOff(), false));
            }
        } else if (clientMessage instanceof RecordingState rs) {
            if (callService.areActiveCallPeers(rs.callId(), username, rs.to())) {
                router.sendToUser(rs.to(), new RecordingStateRelay(username, rs.callId(), rs.recording()));
            }
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
            callService.handleDisconnect(username); // ← rớt THẬT → đặt grace (không phải đổi tab)
            roomService.handleDisconnect(username);
            presence.leave(username);
            redisTemplate.delete("route:" + username);
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
