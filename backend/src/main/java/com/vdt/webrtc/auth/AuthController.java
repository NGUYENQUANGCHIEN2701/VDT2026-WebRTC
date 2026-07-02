package com.vdt.webrtc.auth;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
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
import com.vdt.webrtc.auth.dto.ForgotPasswordRequest;
import com.vdt.webrtc.auth.dto.ForgotPasswordResponse;
import com.vdt.webrtc.auth.dto.GoogleLoginRequest;
import com.vdt.webrtc.auth.dto.LoginRequest;
import com.vdt.webrtc.auth.dto.MessageResponse;
import com.vdt.webrtc.auth.dto.RegisterRequest;
import com.vdt.webrtc.auth.dto.RegisterResponse;
import com.vdt.webrtc.auth.dto.ResendEmailOtpRequest;
import com.vdt.webrtc.auth.dto.ResetPasswordRequest;
import com.vdt.webrtc.auth.dto.VerifyEmailRequest;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final boolean cookieSecure;

    public AuthController(AuthService authService, @Value("${app.cookie.secure}") boolean cookieSecure) {
        this.authService = authService;
        this.cookieSecure = cookieSecure;
    }

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        RegisterResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginResult result = authService.login(request);
        return authResponse(result);
    }

    @PostMapping("/verify-email")
    public ResponseEntity<MessageResponse> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        authService.verifyEmail(request.email(), request.otp());
        return ResponseEntity.ok(new MessageResponse("Email verified successfully"));
    }

    @PostMapping("/resend-verification-otp")
    public ResponseEntity<MessageResponse> resendVerificationOtp(@Valid @RequestBody ResendEmailOtpRequest request) {
        authService.resendEmailVerificationCode(request.email());
        return ResponseEntity.ok(new MessageResponse("If the email needs verification, a code has been sent"));
    }

    @PostMapping("/google")
    public ResponseEntity<AuthResponse> googleLogin(@Valid @RequestBody GoogleLoginRequest request) {
        LoginResult result = authService.loginWithGoogle(request);
        return authResponse(result);
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<ForgotPasswordResponse> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        return ResponseEntity.ok(authService.requestPasswordReset(request.email()));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request);
        ResponseCookie cookie = buildRefreshCookie("", Duration.ZERO);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .build();
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
                .secure(cookieSecure)
                .sameSite("Lax")
                .path("/api/auth")
                .maxAge(maxAge)
                .build();
    }

    private ResponseEntity<AuthResponse> authResponse(LoginResult result) {
        ResponseCookie cookie = buildRefreshCookie(result.rawRefreshToken(), Duration.ofDays(7));
        AuthResponse body = new AuthResponse(result.accessToken(), result.username(), result.role());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(body);
    }
}
