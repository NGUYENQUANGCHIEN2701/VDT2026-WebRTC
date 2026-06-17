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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.vdt.webrtc.auth.dto.LoginRequest;
import com.vdt.webrtc.auth.dto.RegisterRequest;
import com.vdt.webrtc.auth.dto.RegisterResponse;
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
    private static final SecureRandom RANDOM = new SecureRandom();

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
            AuthenticationManager authenticationManager, RefreshTokenRepository refreshTokenRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
        this.refreshTokenRepository = refreshTokenRepository;
    }

    public RegisterResponse register(RegisterRequest request) {
        String email = request.email();
        String username = request.username();
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

        String accessToken = jwtService.generateToken(user.getUsername(), user.getRole().name());

        String rawRefreshToken = generateRawToken();
        refreshTokenRepository.revokeAllActiveByUser(user);  // Đảm bảo chỉ có 1 refresh token hợp lệ mỗi user
        storeRefreshTokenHash(user, rawRefreshToken);

        return new LoginResult(accessToken, user.getUsername(), user.getRole().name(), rawRefreshToken);
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

        String newAccessToken = jwtService.generateToken(user.getUsername(), user.getRole().name());
        String rawRefreshToken = generateRawToken();
        storeRefreshTokenHash(user, rawRefreshToken);

        return new LoginResult(newAccessToken, user.getUsername(), user.getRole().name(), rawRefreshToken);
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        String tokenHash = sha256Hex(rawToken);
        refreshTokenRepository.revokeActiveByHash(tokenHash);
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
