package com.vdt.webrtc.call;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CallStateRepository {
    private final StringRedisTemplate redis;

    public CallStateRepository(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public Optional<CallSnapshot> find(String callId) {
        Map<Object, Object> h = redis.opsForHash().entries("call:" + callId);
        if (h.isEmpty()) {
            return Optional.empty();
        }
        String startedAtRaw = (String) h.get("startedAt");
        Instant startedAt = startedAtRaw == null
        ? null
        : Instant.ofEpochMilli(Long.parseLong(startedAtRaw));

        return Optional.of(new CallSnapshot(
                callId,
                (String) h.get("state"),
                (String) h.get("reason"),
                (String) h.get("callerId"),
                (String) h.get("calleeId"),
                startedAt));
    }

    public Optional<String> findCallIdByUser(String userId) {
        // GET user-call:{userId} — trả null nếu user không ở cuộc nào
        String callId = redis.opsForValue().get("user-call:" + userId);
        return Optional.ofNullable(callId);
    }

    public void recordStartedAt(String callId, Instant startedAt) {
        redis.opsForHash().put("call:" + callId, "startedAt",
                String.valueOf(startedAt.toEpochMilli()));
    }

    // Đếm số cuộc 1-1 đang "active" LIVE từ Redis tại thời điểm gọi (cho
    // vdt_calls_active gauge) — không cache local để tránh drift.
    public long countActive() {
        Set<String> keys = redis.keys("call:*");
        if (keys == null || keys.isEmpty()) {
            return 0;
        }
        long count = 0;
        for (String key : keys) {
            Object state = redis.opsForHash().get(key, "state");
            if ("active".equals(state)) {
                count++;
            }
        }
        return count;
    }
}
