package com.vdt.webrtc.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.vdt.webrtc.auth.dto.ForgotPasswordResponse;
import com.vdt.webrtc.auth.dto.GoogleLoginRequest;
import com.vdt.webrtc.auth.dto.LoginRequest;
import com.vdt.webrtc.auth.dto.RegisterRequest;
import com.vdt.webrtc.auth.dto.RegisterResponse;
import com.vdt.webrtc.auth.dto.ResetPasswordRequest;
import com.vdt.webrtc.common.DuplicateResourceException;
import com.vdt.webrtc.common.InvalidRefreshTokenException;
import com.vdt.webrtc.config.JwtService;
import com.vdt.webrtc.user.Role;
import com.vdt.webrtc.user.User;
import com.vdt.webrtc.user.UserRepository;

import jakarta.transaction.Transactional;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final GoogleTokenVerifier googleTokenVerifier;
    private final boolean exposePasswordResetToken;
    private static final SecureRandom RANDOM = new SecureRandom();

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
            AuthenticationManager authenticationManager, RefreshTokenRepository refreshTokenRepository,
            PasswordResetTokenRepository passwordResetTokenRepository, GoogleTokenVerifier googleTokenVerifier,
            @Value("${app.password-reset.expose-token:false}") boolean exposePasswordResetToken) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.googleTokenVerifier = googleTokenVerifier;
        this.exposePasswordResetToken = exposePasswordResetToken;
    }

    public RegisterResponse register(RegisterRequest request) {
        String email = request.email();
        String username = request.username();
        ensurePasswordMatches(request.password(), request.confirmPassword());
        if (userRepository.existsByEmail(email) || userRepository.existsByUsername(username)) {
            throw new DuplicateResourceException("Email or username already exists");
        }
        String passwordHash = passwordEncoder.encode(request.password());
        Role role = Role.USER;
        User user = User.builder()
                .username(username)
                .email(email)
                .passwordHash(passwordHash)
                .role(role)
                .build();
        userRepository.save(user);
        return new RegisterResponse(username, email, role.name());
    }

    @Transactional
    public LoginResult login(LoginRequest request) {
        String username = request.username();
        String password = request.password();

        authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(username, password));

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new BadCredentialsException("Invalid username or password"));

        return issueLoginResult(user);
    }

    @Transactional
    public LoginResult refreshToken(String rawToken) {
        String tokenHash = sha256Hex(rawToken);

        Optional<RefreshToken> tokenOpt = refreshTokenRepository.findByTokenHashAndRevokedFalse(tokenHash);
        if (tokenOpt.isEmpty()) {
            throw new InvalidRefreshTokenException("Invalid refresh token");
        }

        RefreshToken token = tokenOpt.get();
        if (token.getExpiresAt().isBefore(Instant.now())) {
            throw new InvalidRefreshTokenException("Refresh token is expired or revoked");
        }

        // Check if the associated user account is locked
        User user = token.getUser();
        if (user.isLocked()) {
            throw new InvalidRefreshTokenException("User account is locked");
        }

        int revokedCount = refreshTokenRepository.revokeActiveByHash(tokenHash);
        if (revokedCount == 0) {
            throw new InvalidRefreshTokenException("Refresh token is already revoked");
        }

        return issueLoginResult(user);
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        String tokenHash = sha256Hex(rawToken);
        refreshTokenRepository.revokeActiveByHash(tokenHash);
    }

    @Transactional
    public ForgotPasswordResponse requestPasswordReset(String email) {
        Optional<User> userOpt = userRepository.findByEmail(email);
        String rawResetToken = null;

        if (userOpt.isPresent()) {
            User user = userOpt.get();
            passwordResetTokenRepository.markAllUnusedByUserAsUsed(user);
            rawResetToken = generateRawToken();
            PasswordResetToken token = PasswordResetToken.builder()
                    .user(user)
                    .tokenHash(sha256Hex(rawResetToken))
                    .expiresAt(Instant.now().plus(Duration.ofMinutes(15)))
                    .build();
            passwordResetTokenRepository.save(token);
        }

        String message = "If this email exists, a password reset link has been created.";
        return new ForgotPasswordResponse(message, exposePasswordResetToken ? rawResetToken : null);
    }

    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        ensurePasswordMatches(request.password(), request.confirmPassword());

        String tokenHash = sha256Hex(request.token());
        PasswordResetToken token = passwordResetTokenRepository.findByTokenHashAndUsedFalse(tokenHash)
                .orElseThrow(() -> new IllegalArgumentException("Reset token is invalid or expired"));

        if (token.getExpiresAt().isBefore(Instant.now())) {
            throw new IllegalArgumentException("Reset token is invalid or expired");
        }

        User user = token.getUser();
        if (user.isLocked()) {
            throw new LockedException("User account is locked");
        }

        user.setPasswordHash(passwordEncoder.encode(request.password()));
        userRepository.save(user);
        token.setUsed(true);
        passwordResetTokenRepository.save(token);
        refreshTokenRepository.revokeAllActiveByUser(user);
    }

    @Transactional
    public LoginResult loginWithGoogle(GoogleLoginRequest request) {
        GoogleIdentity identity = googleTokenVerifier.verify(request.credential());

        User user = userRepository.findByGoogleSub(identity.subject())
                .or(() -> userRepository.findByEmail(identity.email()))
                .map(existing -> {
                    if (existing.getGoogleSub() == null || existing.getGoogleSub().isBlank()) {
                        existing.setGoogleSub(identity.subject());
                        return userRepository.save(existing);
                    }
                    return existing;
                })
                .orElseGet(() -> createGoogleUser(identity));

        if (user.isLocked()) {
            throw new LockedException("User account is locked");
        }

        return issueLoginResult(user);
    }

    private User createGoogleUser(GoogleIdentity identity) {
        User user = User.builder()
                .username(uniqueUsernameFromEmail(identity.email()))
                .email(identity.email())
                .googleSub(identity.subject())
                .passwordHash(passwordEncoder.encode(generateRawToken()))
                .role(Role.USER)
                .build();
        return userRepository.save(user);
    }

    private String uniqueUsernameFromEmail(String email) {
        String localPart = email.split("@", 2)[0].toLowerCase();
        String base = localPart.replaceAll("[^a-z0-9._-]", "-");
        if (base.length() < 3) {
            base = "google-user";
        }
        if (base.length() > 40) {
            base = base.substring(0, 40);
        }

        String candidate = base;
        int suffix = 1;
        while (userRepository.existsByUsername(candidate)) {
            candidate = base + "-" + suffix++;
        }
        return candidate;
    }

    private LoginResult issueLoginResult(User user) {
        String accessToken = jwtService.generateToken(user.getUsername(), user.getRole().name());
        String rawRefreshToken = generateRawToken();
        refreshTokenRepository.revokeAllActiveByUser(user);
        storeRefreshTokenHash(user, rawRefreshToken);
        return new LoginResult(accessToken, user.getUsername(), user.getRole().name(), rawRefreshToken);
    }

    private void ensurePasswordMatches(String password, String confirmPassword) {
        if (!password.equals(confirmPassword)) {
            throw new IllegalArgumentException("Password confirmation does not match");
        }
    }

    private void storeRefreshTokenHash(User user, String rawToken) {
        RefreshToken token = RefreshToken.builder()
                .user(user)
                .tokenHash(sha256Hex(rawToken))
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build();
        refreshTokenRepository.save(token);
    }

    private String sha256Hex(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }

    }

    private String generateRawToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
