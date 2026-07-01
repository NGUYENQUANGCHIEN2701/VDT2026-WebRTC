package com.vdt.webrtc.metrics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

import com.vdt.webrtc.call.CallStateRepository;
import com.vdt.webrtc.room.RoomRepository;
import com.vdt.webrtc.ws.SessionRegistry;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class CallMetricsTest {

    SimpleMeterRegistry registry;
    CallStateRepository callStateRepository;
    RoomRepository roomRepository;
    SessionRegistry sessionRegistry;
    CallMetrics metrics;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        callStateRepository = mock(CallStateRepository.class);
        roomRepository = mock(RoomRepository.class);
        sessionRegistry = new SessionRegistry();
        metrics = new CallMetrics(registry, callStateRepository, roomRepository, sessionRegistry);
    }

    @Test
    void incrementEnded_recordsOneCompletedOneOneCall() {
        metrics.incrementEnded("1-1", "completed");

        double count = registry.get("vdt_calls_ended_total")
                .tag("call_type", "1-1")
                .tag("end_reason", "completed")
                .counter()
                .count();

        assertThat(count).isEqualTo(1.0);
    }

    @Test
    void incrementEnded_calledTwiceWithSameTags_accumulates() {
        metrics.incrementEnded("1-1", "missed");
        metrics.incrementEnded("1-1", "missed");

        double count = registry.get("vdt_calls_ended_total")
                .tag("call_type", "1-1")
                .tag("end_reason", "missed")
                .counter()
                .count();

        assertThat(count).isEqualTo(2.0);
    }

    @Test
    void incrementEnded_groupAndOneOneAreDistinctSeries() {
        metrics.incrementEnded("1-1", "completed");
        metrics.incrementEnded("group", "completed");

        double oneOneCount = registry.get("vdt_calls_ended_total")
                .tag("call_type", "1-1")
                .tag("end_reason", "completed")
                .counter()
                .count();
        double groupCount = registry.get("vdt_calls_ended_total")
                .tag("call_type", "group")
                .tag("end_reason", "completed")
                .counter()
                .count();

        assertThat(oneOneCount).isEqualTo(1.0);
        assertThat(groupCount).isEqualTo(1.0);
    }

    @Test
    void wsSessionsActiveGauge_reflectsLiveSessionRegistrySize() {
        double before = registry.get("vdt_ws_sessions_active").gauge().value();
        assertThat(before).isEqualTo(0.0);

        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("session-1");
        sessionRegistry.register("alice", session);

        double after = registry.get("vdt_ws_sessions_active").gauge().value();
        assertThat(after).isEqualTo(1.0);
    }
}
