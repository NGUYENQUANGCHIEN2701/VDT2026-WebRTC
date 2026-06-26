package com.vdt.webrtc.call;

import java.util.List;

import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

@Component
public class CallStateMachine {
    private final StringRedisTemplate redis;
    private final RedisScript<Long> createScript;
    private final RedisScript<Long> transitionScript;

    public CallStateMachine(StringRedisTemplate redis) {
        this.redis = redis;
        this.createScript = RedisScript.of(new ClassPathResource("scripts/create_call.lua"), Long.class);
        this.transitionScript = RedisScript.of(new ClassPathResource("scripts/transition_call.lua"), Long.class);
    }

    public CreateResult createCall(String callId, String callerId, String calleeId) {
        Long result = redis.execute(createScript,
                List.of("call:" + callId, "user-call:" + callerId, "user-call:" + calleeId),
                callerId, calleeId, callId, String.valueOf(System.currentTimeMillis()), "300");

        if (result == null) {
            throw new IllegalStateException("Redis script execution returned null");
        }
        switch (result.intValue()) {
            case 1:
                return CreateResult.OK;
            case -1:
                return CreateResult.BUSY;
            case -2:
                return CreateResult.GLARE;
            default:
                throw new IllegalStateException("Unexpected result from Redis script: " + result);
        }
    }

    public boolean transition(String callId, String from, String to,
            String reason, String callerId, String calleeId) {
        Long result = redis.execute(transitionScript,
                List.of("call:" + callId, "user-call:" + callerId, "user-call:" + calleeId),
                from, to, reason == null ? "" : reason, String.valueOf(System.currentTimeMillis()));

        if (result == null) {
            throw new IllegalStateException("Redis script execution returned null");
        }
        return result == 1L;
    }
}
