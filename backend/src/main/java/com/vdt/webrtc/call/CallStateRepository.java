package com.vdt.webrtc.call;

import java.util.Map;
import java.util.Optional;

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
        return Optional.of(new CallSnapshot(
                callId,
                (String) h.get("state"),
                (String) h.get("reason"),
                (String) h.get("callerId"),
                (String) h.get("calleeId")));
    }

    public Optional<String> findCallIdByUser(String userId) {
        // GET user-call:{userId} — trả null nếu user không ở cuộc nào
        String callId = redis.opsForValue().get("user-call:" + userId);
        return Optional.ofNullable(callId);
    }
}
