package com.vdt.webrtc.history;

import java.time.Instant;

public record CallHistoryEvent(
        String callId,
        String callerId,
        String calleeId,
        String endReason,
        Instant startedAt,
        Instant endedAt) {
}
