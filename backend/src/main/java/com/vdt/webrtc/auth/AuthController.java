package com.vdt.webrtc.auth;

import java.time.Duration;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.vdt.webrtc.auth.dto.AuthResponse;
import com.vdt.webrtc.auth.dto.LoginRequest;
import com.vdt.webrtc.auth.dto.RegisterRequest;
import com.vdt.webrtc.auth.dto.RegisterResponse;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        RegisterResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginResult result = authService.login(request);

        ResponseCookie cookie = buildRefreshCookie(result.rawRefreshToken(), Duration.ofDays(7));

        AuthResponse body = new AuthResponse(result.accessToken(), result.username(), result.role());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(body);
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refreshToken(
            @CookieValue(name = "refreshToken", required = false) String rawToken) {

        if (rawToken == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        LoginResult result = authService.refreshToken(rawToken);

        ResponseCookie cookie = buildRefreshCookie(result.rawRefreshToken(), Duration.ofDays(7));

        AuthResponse body = new AuthResponse(result.accessToken(), result.username(), result.role());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(body);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name = "refreshToken", required = false) String rawToken) {
        if (rawToken != null) {
            authService.logout(rawToken);
        }
        // Clear the cookie on the client side as well
        ResponseCookie cookie = buildRefreshCookie("", Duration.ZERO);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .build();
    }

    private ResponseCookie buildRefreshCookie(String rawToken, Duration maxAge) {
        return ResponseCookie.from("refreshToken", rawToken)
                .httpOnly(true)
                .secure(false)
                .sameSite("Lax")
                .path("/api/auth")
                .maxAge(maxAge)
                .build();
    }
}
