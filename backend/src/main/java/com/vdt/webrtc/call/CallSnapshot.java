package com.vdt.webrtc.call;

import java.time.Instant;

public record CallSnapshot(
                String callId,
                String state,
                String reason,
                String callerId,
                String calleeId,
                Instant startedAt) {
}
