package com.vdt.webrtc.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.vdt.webrtc.TestcontainersConfiguration;
import com.vdt.webrtc.user.User;
import com.vdt.webrtc.user.UserRepository;

import jakarta.servlet.http.Cookie;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(properties = "app.password-reset.expose-token=true")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AuthControllerTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    UserRepository userRepository;
    @Autowired
    EmailVerificationTokenRepository emailVerificationTokenRepository;

    // Helper (Arrange dùng chung): đăng ký + login 1 user, trả về cookie refreshToken
    private Cookie loginAndGetCookie(String username) throws Exception {
        String email = username + "@test.com";
        mockMvc.perform(post("/api/auth/register")
                .contentType("application/json")
                .content("{\"username\":\"" + username + "\",\"password\":\"Password123\",\"confirmPassword\":\"Password123\",\"email\":\"" + email + "\"}"))
                .andExpect(status().isCreated());
        markEmailVerified(email);

        MvcResult res = mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"" + username + "\",\"password\":\"Password123\"}"))
                .andExpect(status().isOk())
                .andReturn();

        return res.getResponse().getCookie("refreshToken");
    }

    @Test
    void login_returns_token_and_sets_refresh_cookie() throws Exception {
        Cookie cookie = loginAndGetCookie("login_user");

        assertThat(cookie).isNotNull();
        assertThat(cookie.getValue()).isNotBlank();
        assertThat(cookie.isHttpOnly()).isTrue();
    }

    @Test
    void refresh_with_valid_cookie_rotates_token() throws Exception {
        Cookie oldCookie = loginAndGetCookie("refresh_user");

        MvcResult res = mockMvc.perform(post("/api/auth/refresh").cookie(oldCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", notNullValue()))
                .andReturn();

        Cookie newCookie = res.getResponse().getCookie("refreshToken");
        assertThat(newCookie).isNotNull();
        assertThat(newCookie.getValue()).isNotEqualTo(oldCookie.getValue());
    }

    @Test
    void reusing_rotated_cookie_returns_401() throws Exception {
        Cookie oldCookie = loginAndGetCookie("reuse_user");

        // lần 1: refresh hợp lệ → token bị xoay
        mockMvc.perform(post("/api/auth/refresh").cookie(oldCookie))
                .andExpect(status().isOk());

        // lần 2: dùng lại cookie CŨ (đã bị xoay) → bị chặn
        mockMvc.perform(post("/api/auth/refresh").cookie(oldCookie))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void logout_revokes_token_and_clears_cookie() throws Exception {
        Cookie cookie = loginAndGetCookie("logout_user");

        MvcResult res = mockMvc.perform(post("/api/auth/logout").cookie(cookie))
                .andExpect(status().isNoContent())
                .andReturn();

        Cookie cleared = res.getResponse().getCookie("refreshToken");
        assertThat(cleared.getMaxAge()).isZero();

        // token đã revoke → refresh bằng cookie đó phải fail
        mockMvc.perform(post("/api/auth/refresh").cookie(cookie))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void register_with_mismatched_confirm_password_returns_400() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .contentType("application/json")
                .content("""
                        {
                          "username": "mismatch_user",
                          "password": "Password123",
                          "confirmPassword": "Password124",
                          "email": "mismatch_user@test.com"
                        }
                        """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void forgot_password_then_reset_allows_login_with_new_password() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .contentType("application/json")
                .content("""
                        {
                          "username": "reset_user",
                          "password": "Password123",
                          "confirmPassword": "Password123",
                          "email": "reset_user@test.com"
                        }
                        """))
                .andExpect(status().isCreated());
        markEmailVerified("reset_user@test.com");

        MvcResult forgot = mockMvc.perform(post("/api/auth/forgot-password")
                .contentType("application/json")
                .content("{\"email\":\"reset_user@test.com\"}"))
                .andExpect(status().isOk())
                .andReturn();

        String resetToken = objectMapper.readTree(forgot.getResponse().getContentAsString())
                .get("resetToken").asString();
        assertThat(resetToken).isNotBlank();

        mockMvc.perform(post("/api/auth/reset-password")
                .contentType("application/json")
                .content("""
                        {
                          "token": "%s",
                          "password": "NewPassword123",
                          "confirmPassword": "NewPassword123"
                        }
                        """.formatted(resetToken)))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"reset_user\",\"password\":\"Password123\"}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"reset_user\",\"password\":\"NewPassword123\"}"))
                .andExpect(status().isOk());
    }
    @Test
    void forgot_password_within_cooldown_doesNotIssueSecondToken() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .contentType("application/json")
                .content("""
                        {
                          "username": "cooldown_user",
                          "password": "Password123",
                          "confirmPassword": "Password123",
                          "email": "cooldown_user@test.com"
                        }
                        """))
                .andExpect(status().isCreated());
        markEmailVerified("cooldown_user@test.com");

        MvcResult first = mockMvc.perform(post("/api/auth/forgot-password")
                .contentType("application/json")
                .content("{\"email\":\"cooldown_user@test.com\"}"))
                .andExpect(status().isOk())
                .andReturn();

        String firstMessage = objectMapper.readTree(first.getResponse().getContentAsString())
                .get("message").asString();
        String firstToken = objectMapper.readTree(first.getResponse().getContentAsString())
                .get("resetToken").asString();
        assertThat(firstToken).isNotBlank();

        MvcResult second = mockMvc.perform(post("/api/auth/forgot-password")
                .contentType("application/json")
                .content("{\"email\":\"cooldown_user@test.com\"}"))
                .andExpect(status().isOk())
                .andReturn();

        String secondMessage = objectMapper.readTree(second.getResponse().getContentAsString())
                .get("message").asString();
        assertThat(secondMessage).isEqualTo(firstMessage);
        assertThat(second.getResponse().getContentAsString()).contains("\"resetToken\":null");
    }

    @Test
    void login_before_email_verification_returns_403_with_resend_hint() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .contentType("application/json")
                .content("""
                        {
                          "username": "unverified_user",
                          "password": "Password123",
                          "confirmPassword": "Password123",
                          "email": "unverified_user@test.com"
                        }
                        """))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"unverified_user\",\"password\":\"Password123\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.fieldErrors.reason").value("EMAIL_NOT_VERIFIED"))
                .andExpect(jsonPath("$.fieldErrors.email").value("unverified_user@test.com"));
    }

    @Test
    void verify_email_allows_login() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .contentType("application/json")
                .content("""
                        {
                          "username": "verify_user",
                          "password": "Password123",
                          "confirmPassword": "Password123",
                          "email": "verify_user@test.com"
                        }
                        """))
                .andExpect(status().isCreated());

        User user = userRepository.findByEmail("verify_user@test.com").orElseThrow();
        emailVerificationTokenRepository.save(EmailVerificationToken.builder()
                .user(user)
                .codeHash(sha256Hex("123456"))
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(600))
                .used(false)
                .build());

        mockMvc.perform(post("/api/auth/verify-email")
                .contentType("application/json")
                .content("{\"email\":\"verify_user@test.com\",\"otp\":\"123456\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"verify_user\",\"password\":\"Password123\"}"))
                .andExpect(status().isOk());
    }

    private void markEmailVerified(String email) {
        User user = userRepository.findByEmail(email).orElseThrow();
        user.setEmailVerified(true);
        userRepository.save(user);
    }

    private String sha256Hex(String raw) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(raw.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(digest);
    }
}
