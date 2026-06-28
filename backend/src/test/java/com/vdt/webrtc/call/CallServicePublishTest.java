package com.vdt.webrtc.call;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.vdt.webrtc.history.CallHistoryPublisher;
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

    CallService callService;

    @BeforeEach
    void setUp() {
        // 2 tham số cuối là ring/grace seconds — giá trị bất kỳ cho test
        callService = new CallService(stateMachine, timers, repo, router, publisher, 30, 15);
    }

    // D-05: cuộc gọi tới người đang bận → KHÔNG bao giờ ghi lịch sử
    @Test
    void busyBranch_neverPublishesHistory() {
        when(stateMachine.createCall(anyString(), eq("alice"), eq("bob")))
                .thenReturn(CreateResult.BUSY);

        callService.handleInvite("alice", "bob");

        verify(publisher, never()).publish(any());
    }
}
