package com.vdt.webrtc.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.web.servlet.MockMvc;

import com.vdt.webrtc.TestcontainersConfiguration;

@SpringBootTest(properties = {
        "app.rate-limit.otp-max-requests=2",
        "app.rate-limit.otp-window-seconds=60"
})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class RateLimitIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    StringRedisTemplate redis;

    @BeforeEach
    void clean() {
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    @Test
    void resendVerificationOtp_returns429AfterExceedingConfiguredMax() throws Exception {
        String body = "{\"email\":\"rate_limit_user@test.com\"}";

        mockMvc.perform(post("/api/auth/resend-verification-otp")
                .contentType("application/json")
                .content(body))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/resend-verification-otp")
                .contentType("application/json")
                .content(body))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/resend-verification-otp")
                .contentType("application/json")
                .content(body))
                .andExpect(status().isTooManyRequests());
    }
}
