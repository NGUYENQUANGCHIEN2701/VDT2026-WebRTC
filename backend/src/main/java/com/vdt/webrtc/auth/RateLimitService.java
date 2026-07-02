package com.vdt.webrtc.auth;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import com.vdt.webrtc.common.RateLimitExceededException;

@Service
public class RateLimitService {
    private final StringRedisTemplate redis;
    private final RedisScript<Long> rateLimitScript;
    private final int windowSeconds;
    private final int maxRequests;

    public RateLimitService(StringRedisTemplate redis,
            @Value("${app.rate-limit.otp-window-seconds:900}") int windowSeconds,
            @Value("${app.rate-limit.otp-max-requests:5}") int maxRequests) {
        this.redis = redis;
        this.rateLimitScript = RedisScript.of(new ClassPathResource("scripts/rate_limit.lua"), Long.class);
        this.windowSeconds = windowSeconds;
        this.maxRequests = maxRequests;
    }

    public void enforce(String endpoint, String clientIp) {
        String key = "ratelimit:" + endpoint + ":" + clientIp;
        Long count = redis.execute(rateLimitScript, List.of(key), String.valueOf(windowSeconds));

        if (count == null) {
            throw new IllegalStateException("Redis rate_limit.lua returned null");
        }

        if (count > maxRequests) {
            throw new RateLimitExceededException("Too many requests. Please try again later.");
        }
    }
}
