package com.vdt.webrtc.history.dto;

import java.time.Instant;

public record HistoryRow(
        String callId,
        String peerId,
        String direction,
        String endReason,
        Long durationMs,
        Instant startedAt,
        Instant endedAt) {
}
