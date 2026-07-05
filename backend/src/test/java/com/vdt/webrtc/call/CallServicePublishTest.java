package com.vdt.webrtc.call;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.vdt.webrtc.history.CallHistoryPublisher;
import com.vdt.webrtc.metrics.CallMetrics;
import com.vdt.webrtc.presence.PresenceService;
import com.vdt.webrtc.ws.MessageRouter;

@ExtendWith(MockitoExtension.class)
class CallServicePublishTest {

    @Mock
    CallStateMachine stateMachine;
    @Mock
    CallTimerService timers;
    @Mock
    CallStateRepository repo;
    @Mock
    MessageRouter router;
    @Mock
    CallHistoryPublisher publisher;
    @Mock
    CallMetrics metrics;
    @Mock
    PresenceService presence;

    CallService callService;

    @BeforeEach
    void setUp() {
        // 2 tham số cuối là ring/grace seconds — giá trị bất kỳ cho test
        callService = new CallService(stateMachine, timers, repo, router, publisher, metrics, presence, 30, 15);
    }

    // D-05: cuộc gọi tới người đang bận → KHÔNG bao giờ ghi lịch sử
    @Test
    void busyBranch_neverPublishesHistory() {
        when(stateMachine.createCall(anyString(), eq("alice"), eq("bob")))
                .thenReturn(CreateResult.BUSY);

        callService.handleInvite("alice", "bob");

        verify(publisher, never()).publish(any());
    }

    // hangup thành công → observer phải hội tụ presence (T-quick260702)
    @Test
    void endedTransition_publishesPresenceChange_forHangUp() {
        CallSnapshot call = new CallSnapshot("call-1", "active", null, "alice", "bob", null);
        when(repo.find("call-1")).thenReturn(Optional.of(call));
        when(stateMachine.transition("call-1", "active", "ended", "completed", "alice", "bob"))
                .thenReturn(true);

        callService.handleHangUp("alice", "call-1");

        verify(presence).publishChanged();
    }

    // CAS thua (race) → KHÔNG được publish nhầm presence
    @Test
    void failedTransition_doesNotPublishPresenceChange() {
        CallSnapshot call = new CallSnapshot("call-1", "active", null, "alice", "bob", null);
        when(repo.find("call-1")).thenReturn(Optional.of(call));
        when(stateMachine.transition("call-1", "active", "ended", "completed", "alice", "bob"))
                .thenReturn(false);

        callService.handleHangUp("alice", "call-1");

        verify(presence, never()).publishChanged();
    }

    // invite thành công (OK) → phải publish presence change ngay khi bắt đầu ringing,
    // không đợi tới lúc cuộc gọi kết thúc (T-quick260705)
    @Test
    void okBranch_publishesPresenceChange() {
        when(stateMachine.createCall(anyString(), eq("alice"), eq("bob")))
                .thenReturn(CreateResult.OK);

        callService.handleInvite("alice", "bob");

        verify(presence).publishChanged();
    }

    // reject khi đang ringing → cũng phải publish presence change
    @Test
    void missedTimeout_publishesPresenceChange() {
        CallSnapshot call = new CallSnapshot("call-1", "ringing", null, "alice", "bob", null);
        when(repo.find("call-1")).thenReturn(Optional.of(call));
        when(stateMachine.transition("call-1", "ringing", "ended", "rejected", "alice", "bob"))
                .thenReturn(true);

        callService.handleReject("bob", "call-1");

        verify(presence).publishChanged();
    }
}
