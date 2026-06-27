package com.vdt.webrtc.call;

import java.time.Duration;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.vdt.webrtc.ws.MessageRouter;
import com.vdt.webrtc.ws.message.CallStateChanged;


@Service
public class CallService {
    private final CallStateMachine stateMachine;
    private final CallTimerService timers;
    private final CallStateRepository repo;
    private final MessageRouter router;
    private final Duration ringTimeout;

    public CallService(CallStateMachine stateMachine, CallTimerService timers,
            CallStateRepository repo, MessageRouter router,
            @Value("${call.ring-timeout-seconds}") long ringSeconds) {
        this.stateMachine = stateMachine;
        this.timers = timers;
        this.repo = repo;
        this.router = router;
        this.ringTimeout = Duration.ofSeconds(ringSeconds);
    }

    // bắn event cho cả caller và callee.
    private void broadcast(String callId, String state, String reason, String callerId, String calleeId) {
        CallStateChanged event = new CallStateChanged(callId, state, reason, callerId, calleeId);
        router.sendToUser(callerId, event);
        router.sendToUser(calleeId, event);
    }
    
    public void handleInvite(String callerId, String calleeId) {
        String callId = UUID.randomUUID().toString();
        CreateResult result = stateMachine.createCall(callId, callerId, calleeId);
        switch (result) {
            case OK -> {
                broadcast(callId, "ringing", null, callerId, calleeId); // cả 2 thấy ringing
                timers.scheduleRingTimeout(callId, ringTimeout, () -> onRingTimeout(callId));
            }
            case BUSY -> router.sendToUser(callerId, // chỉ caller, callee KHÔNG reo
                    new CallStateChanged(callId, "ended", "busy", callerId, calleeId));
            case GLARE -> {
                // Cuộc gọi NGƯỢC (bob->alice) đã tồn tại & đã reo cả 2 bên.
                // Hòa giải lower-userId-wins sẽ làm phía client khi dựng frontend. Tạm thời
                // không tạo cuộc mới.
            }
        }
    }

    private void onRingTimeout(String callId) {
        repo.find(callId).ifPresent(call -> {
            // CAS chỉ thành công nếu vẫn đang ringing (chưa ai nhận) → tự chống race
            boolean ok = stateMachine.transition(callId, "ringing", "ended", "missed",
                    call.callerId(), call.calleeId());
            if (ok) {
                broadcast(callId, "ended", "missed", call.callerId(), call.calleeId());
            }
        });
    }

    public void handleAccept(String actorId, String callId) {
        repo.find(callId).ifPresent(call -> {
            if (!actorId.equals(call.calleeId()))
                return; // chỉ callee được accept
            timers.cancelRingTimer(callId); // hủy timer missed
            boolean ok = stateMachine.transition(callId, "ringing", "active", null,
                    call.callerId(), call.calleeId());
            if (ok) {
                broadcast(callId, "active", null, call.callerId(), call.calleeId());
            }
        });
    }

    public void handleReject(String actorId, String callId) {
        repo.find(callId).ifPresent(call -> {
            if (!actorId.equals(call.calleeId()))
                return; // chỉ callee được reject
            timers.cancelRingTimer(callId); // hủy timer missed
            boolean ok = stateMachine.transition(callId, "ringing", "ended", "rejected",
                    call.callerId(), call.calleeId());
            if (ok) {
                broadcast(callId, "ended", "rejected", call.callerId(), call.calleeId());
            }
        });
    }

    public void handleCancel(String actorId, String callId) {
        repo.find(callId).ifPresent(call -> {
            if (!actorId.equals(call.callerId()))
                return; // chỉ caller được cancel
            timers.cancelRingTimer(callId); // hủy timer missed
            boolean ok = stateMachine.transition(callId, "ringing", "ended", "cancelled",
                    call.callerId(), call.calleeId());
            if (ok) {
                broadcast(callId, "ended", "cancelled", call.callerId(), call.calleeId());
            }
        });
    }

    public void handleHangUp(String actorId, String callId) {
        repo.find(callId).ifPresent(call -> {
            if (!actorId.equals(call.callerId()) && !actorId.equals(call.calleeId()))
                return; // chỉ caller/callee được hangup
            timers.cancelRingTimer(callId); // hủy timer missed (nếu đang ringing)
            boolean ok = stateMachine.transition(callId, "active", "ended", "completed",
                    call.callerId(), call.calleeId());
            if (ok) {
                broadcast(callId, "ended", "completed", call.callerId(), call.calleeId());
            }
        });
    }

}
