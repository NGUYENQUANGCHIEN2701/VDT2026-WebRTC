package com.vdt.webrtc.auth;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;

import com.vdt.webrtc.TestcontainersConfiguration;
import com.vdt.webrtc.common.RateLimitExceededException;

@SpringBootTest(properties = {
        "app.rate-limit.otp-max-requests=3",
        "app.rate-limit.otp-window-seconds=60"
})
@Import(TestcontainersConfiguration.class)
class RateLimitServiceTest {

    @Autowired
    RateLimitService rateLimitService;

    @Autowired
    StringRedisTemplate redis;

    @BeforeEach
    void clean() {
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    @Test
    void enforce_allowsUpToMaxRequests_thenThrowsOnNext() {
        assertDoesNotThrow(() -> rateLimitService.enforce("register", "1.1.1.1"));
        assertDoesNotThrow(() -> rateLimitService.enforce("register", "1.1.1.1"));
        assertDoesNotThrow(() -> rateLimitService.enforce("register", "1.1.1.1"));

        assertThrows(RateLimitExceededException.class, () -> rateLimitService.enforce("register", "1.1.1.1"));
    }

    @Test
    void enforce_countersAreIndependentPerIp() {
        assertDoesNotThrow(() -> rateLimitService.enforce("register", "2.2.2.2"));
        assertDoesNotThrow(() -> rateLimitService.enforce("register", "2.2.2.2"));
        assertDoesNotThrow(() -> rateLimitService.enforce("register", "2.2.2.2"));

        assertDoesNotThrow(() -> rateLimitService.enforce("register", "3.3.3.3"));
    }

    @Test
    void enforce_countersAreIndependentPerEndpoint() {
        assertDoesNotThrow(() -> rateLimitService.enforce("register", "4.4.4.4"));
        assertDoesNotThrow(() -> rateLimitService.enforce("register", "4.4.4.4"));
        assertDoesNotThrow(() -> rateLimitService.enforce("register", "4.4.4.4"));

        assertDoesNotThrow(() -> rateLimitService.enforce("forgot-password", "4.4.4.4"));
    }
}
