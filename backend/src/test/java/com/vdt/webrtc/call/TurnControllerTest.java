package com.vdt.webrtc.call;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import tools.jackson.databind.JsonNode; // chỉ ĐỌC response trong test
import tools.jackson.databind.ObjectMapper; // Jackson 3 (Boot 4) — inject từ context
import com.vdt.webrtc.TestcontainersConfiguration;

/**
 * Khóa contract credential TURN ephemeral (RESEARCH Pattern 5):
 * username = "<expiryEpochSeconds>:<userId>"
 * credential = base64( HMAC-SHA1( static-auth-secret, username ) )
 * Recompute HMAC độc lập, không tin mù controller. FAIL vì endpoint chưa có →
 * RED.
 */
@SpringBootTest(properties = "turn.secret=test-turn-secret-0123456789")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class TurnControllerTest {

    private static final String SECRET = "test-turn-secret-0123456789";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper; // Jackson 3 — KHÔNG new com.fasterxml

    private String loginAndGetToken(String username) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .contentType("application/json")
                .content("{\"username\":\"" + username + "\",\"password\":\"Password123\","
                        + "\"email\":\"" + username + "@test.com\"}"))
                .andExpect(status().isCreated());

        MvcResult res = mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"" + username + "\",\"password\":\"Password123\"}"))
                .andExpect(status().isOk())
                .andReturn();

        return objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();
    }

    @Test
    void turn_credential_matches_independently_recomputed_hmac() throws Exception {
        String token = loginAndGetToken("alice");

        MvcResult res = mockMvc.perform(get("/api/turn-credentials")
                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        String username = body.get("username").asText();
        String credential = body.get("credential").asText();

        assertThat(username).endsWith(":alice"); // userId từ principal
        assertThat(credential).isEqualTo(hmacSha1Base64(SECRET, username));

        String urls = body.get("urls").toString();
        assertThat(urls).contains("stun:");
        assertThat(urls).contains("turn:");
    }

    private static String hmacSha1Base64(String secret, String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
        return Base64.getEncoder().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }
}
