package com.vdt.webrtc.metrics;

import org.springframework.stereotype.Component;

import com.vdt.webrtc.call.CallStateRepository;
import com.vdt.webrtc.room.RoomRepository;
import com.vdt.webrtc.ws.SessionRegistry;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

@Component
public class CallMetrics {
    private final MeterRegistry registry;

    public CallMetrics(MeterRegistry registry, CallStateRepository callStateRepository,
            RoomRepository roomRepository, SessionRegistry sessionRegistry) {
        this.registry = registry;

        // vdt_calls_active{call_type} — đọc LIVE từ Redis tại thời điểm scrape, không cache local.
        Gauge.builder("vdt_calls_active", callStateRepository, CallStateRepository::countActive)
                .tag("call_type", "1-1")
                .register(registry);
        Gauge.builder("vdt_calls_active", roomRepository, RoomRepository::countActiveRooms)
                .tag("call_type", "group")
                .register(registry);

        // vdt_ws_sessions_active — SessionRegistry là @Component singleton, an toàn với
        // Micrometer's weak-reference Gauge (không bị GC như 1 object tạm).
        Gauge.builder("vdt_ws_sessions_active", sessionRegistry, r -> r.all().size())
                .register(registry);
    }

    // Duy nhất 1 counter family, phân biệt bằng tag — không tách 2 metric name
    // riêng cho 1-1 và group (D-03). Counter.builder(...).register(...) là
    // idempotent theo tag set nên không cần cache thủ công.
    public void incrementEnded(String callType, String endReason) {
        Counter.builder("vdt_calls_ended_total")
                .tag("call_type", callType)
                .tag("end_reason", endReason)
                .register(registry)
                .increment();
    }
}
