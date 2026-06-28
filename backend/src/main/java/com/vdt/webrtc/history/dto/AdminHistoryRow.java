package com.vdt.webrtc.history.dto;

import java.time.Instant;

public record AdminHistoryRow(
        String callId, String callerId, String calleeId,
        String endReason, Long durationMs, Instant startedAt, Instant endedAt) {
}
