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
import org.springframework.web.util.UriComponentsBuilder;

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
    private final EmailDeliveryService emailDeliveryService;
    private final EmailVerificationService emailVerificationService;
    private final boolean exposePasswordResetToken;
    private final String frontendUrl;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration RESET_RESEND_COOLDOWN = Duration.ofSeconds(60);

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
            AuthenticationManager authenticationManager, RefreshTokenRepository refreshTokenRepository,
            PasswordResetTokenRepository passwordResetTokenRepository,
            GoogleTokenVerifier googleTokenVerifier,
            EmailDeliveryService emailDeliveryService,
            EmailVerificationService emailVerificationService,
            @Value("${app.password-reset.expose-token:false}") boolean exposePasswordResetToken,
            @Value("${app.frontend-url:http://localhost:5173}") String frontendUrl) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.googleTokenVerifier = googleTokenVerifier;
        this.emailDeliveryService = emailDeliveryService;
        this.emailVerificationService = emailVerificationService;
        this.exposePasswordResetToken = exposePasswordResetToken;
        this.frontendUrl = frontendUrl;
    }

    @Transactional
    public RegisterResponse register(RegisterRequest request) {
        String email = request.email();
        String username = request.username();
        ensurePasswordMatches(request.password(), request.confirmPassword());
        if (userRepository.existsByEmail(email) || userRepository.existsByUsername(username)) {
            throw new DuplicateResourceException("Email hoặc tên đăng nhập đã được sử dụng");
        }
        String passwordHash = passwordEncoder.encode(request.password());
        Role role = Role.USER;
        boolean emailVerified = emailVerificationService.shouldAutoVerify(email);
        User user = User.builder()
                .username(username)
                .email(email)
                .passwordHash(passwordHash)
                .role(role)
                .emailVerified(emailVerified)
                .build();
        userRepository.save(user);
        if (!emailVerified) {
            emailVerificationService.issueCode(user, false);
        }
        return new RegisterResponse(username, email, role.name());
    }

    @Transactional
    public LoginResult login(LoginRequest request) {
        String username = request.username();
        String password = request.password();

        authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(username, password));

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new BadCredentialsException("Tên đăng nhập hoặc mật khẩu không đúng"));

        if (!user.isEmailVerified()) {
            throw new EmailNotVerifiedException(user.getEmail());
        }

        return issueLoginResult(user);
    }

    @Transactional
    public LoginResult refreshToken(String rawToken) {
        String tokenHash = sha256Hex(rawToken);

        Optional<RefreshToken> tokenOpt = refreshTokenRepository.findByTokenHashAndRevokedFalse(tokenHash);
        if (tokenOpt.isEmpty()) {
            throw new InvalidRefreshTokenException("Mã làm mới phiên đăng nhập không hợp lệ");
        }

        RefreshToken token = tokenOpt.get();
        if (token.getExpiresAt().isBefore(Instant.now())) {
            throw new InvalidRefreshTokenException("Phiên đăng nhập đã hết hạn hoặc đã bị thu hồi");
        }

        // Check if the associated user account is locked
        User user = token.getUser();
        if (user.isLocked()) {
            throw new InvalidRefreshTokenException("Tài khoản đã bị khóa");
        }

        int revokedCount = refreshTokenRepository.revokeActiveByHash(tokenHash);
        if (revokedCount == 0) {
            throw new InvalidRefreshTokenException("Phiên đăng nhập đã bị thu hồi");
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
            boolean coolingDown = passwordResetTokenRepository
                    .findTopByUserAndUsedFalseOrderByCreatedAtDesc(user)
                    .filter(t -> t.getCreatedAt().plus(RESET_RESEND_COOLDOWN).isAfter(Instant.now()))
                    .isPresent();
            if (!coolingDown) {
                passwordResetTokenRepository.markAllUnusedByUserAsUsed(user);
                rawResetToken = generateRawToken();
                PasswordResetToken token = PasswordResetToken.builder()
                        .user(user)
                        .tokenHash(sha256Hex(rawResetToken))
                        .expiresAt(Instant.now().plus(Duration.ofMinutes(15)))
                        .createdAt(Instant.now())
                        .build();
                passwordResetTokenRepository.save(token);
                String resetLink = UriComponentsBuilder.fromUriString(frontendUrl)
                        .path("/reset-password")
                        .queryParam("token", rawResetToken)
                        .build()
                        .toUriString();
                emailDeliveryService.sendPasswordResetLink(user.getEmail(), resetLink);
            }
        }

        String message = "Nếu email này tồn tại, liên kết đặt lại mật khẩu đã được tạo.";
        return new ForgotPasswordResponse(message, exposePasswordResetToken ? rawResetToken : null);
    }

    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        ensurePasswordMatches(request.password(), request.confirmPassword());

        String tokenHash = sha256Hex(request.token());
        PasswordResetToken token = passwordResetTokenRepository.findByTokenHashAndUsedFalse(tokenHash)
                .orElseThrow(() -> new IllegalArgumentException("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn"));

        if (token.getExpiresAt().isBefore(Instant.now())) {
            throw new IllegalArgumentException("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn");
        }

        User user = token.getUser();
        if (user.isLocked()) {
            throw new LockedException("Tài khoản đã bị khóa");
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
            throw new LockedException("Tài khoản đã bị khóa");
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
                .emailVerified(true)
                .build();
        return userRepository.save(user);
    }

    // dontRollbackOn phải khớp với EmailVerificationService.verify() — cả hai method
    // đều tham gia CÙNG MỘT transaction vật lý (REQUIRED lồng nhau); nếu method ngoài
    // này không khai báo dontRollbackOn, nó sẽ đánh dấu rollback-only khi exception đi
    // qua, ghi đè mất rule của method trong, khiến attempts/lock không bao giờ persist.
    @Transactional(dontRollbackOn = IllegalArgumentException.class)
    public void verifyEmail(String email, String otp) {
        emailVerificationService.verify(email, otp);
    }

    @Transactional
    public void resendEmailVerificationCode(String email) {
        emailVerificationService.resend(email);
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
            throw new IllegalArgumentException("Mật khẩu xác nhận không khớp");
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
