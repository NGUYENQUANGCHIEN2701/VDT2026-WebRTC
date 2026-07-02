package com.vdt.webrtc.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.vdt.webrtc.user.User;
import com.vdt.webrtc.user.UserRepository;

import jakarta.transaction.Transactional;

@Service
public class EmailVerificationService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration OTP_TTL = Duration.ofMinutes(10);
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);

    private final UserRepository userRepository;
    private final EmailVerificationTokenRepository tokenRepository;
    private final EmailDeliveryService emailDeliveryService;
    private final Set<String> autoVerifyDomains;
    private final int maxAttempts;

    public EmailVerificationService(
            UserRepository userRepository,
            EmailVerificationTokenRepository tokenRepository,
            EmailDeliveryService emailDeliveryService,
            @Value("${app.email-verification.auto-verify-domains:}") String autoVerifyDomains,
            @Value("${app.email-verification.max-attempts:5}") int maxAttempts) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.emailDeliveryService = emailDeliveryService;
        this.autoVerifyDomains = Arrays.stream(autoVerifyDomains.split(","))
                .map(String::trim)
                .map(String::toLowerCase)
                .filter(domain -> !domain.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        this.maxAttempts = maxAttempts;
    }

    public boolean shouldAutoVerify(String email) {
        int at = email.lastIndexOf('@');
        if (at < 0 || at == email.length() - 1) {
            return false;
        }
        return autoVerifyDomains.contains(email.substring(at + 1).toLowerCase());
    }

    @Transactional
    public void issueCode(User user, boolean enforceCooldown) {
        Instant now = Instant.now();
        if (enforceCooldown) {
            tokenRepository.findTopByUserAndUsedFalseOrderByCreatedAtDesc(user)
                    .filter(token -> token.getCreatedAt().plus(RESEND_COOLDOWN).isAfter(now))
                    .ifPresent(token -> {
                        throw new IllegalArgumentException("Vui lòng chờ trước khi yêu cầu mã xác minh mới");
                    });
        }

        tokenRepository.markAllUnusedByUserAsUsed(user);
        String code = generateOtp();
        EmailVerificationToken token = EmailVerificationToken.builder()
                .user(user)
                .codeHash(sha256Hex(code))
                .createdAt(now)
                .expiresAt(now.plus(OTP_TTL))
                .used(false)
                .build();
        tokenRepository.save(token);
        emailDeliveryService.sendVerificationCode(user.getEmail(), code);
    }

    // dontRollbackOn: các nhánh throw dưới đây CỐ Ý ghi trạng thái token trước khi throw
    // (đánh dấu expired/lock sau nhiều lần đoán sai) — nếu để mặc định rollback,
    // toàn bộ mutation trong transaction này sẽ bị hủy khi throw, attempts/used
    // sẽ không bao giờ persist.
    @Transactional(dontRollbackOn = IllegalArgumentException.class)
    public void verify(String email, String otp) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Mã xác minh không hợp lệ hoặc đã hết hạn"));

        if (user.isEmailVerified()) {
            return;
        }

        EmailVerificationToken token = tokenRepository.findTopByUserAndUsedFalseOrderByCreatedAtDesc(user)
                .orElseThrow(() -> new IllegalArgumentException("Mã xác minh không hợp lệ hoặc đã hết hạn"));

        if (token.getExpiresAt().isBefore(Instant.now())) {
            token.setUsed(true);
            tokenRepository.save(token);
            throw new IllegalArgumentException("Mã xác minh không hợp lệ hoặc đã hết hạn");
        }

        if (!token.getCodeHash().equals(sha256Hex(otp))) {
            token.setAttempts(token.getAttempts() + 1);
            if (token.getAttempts() >= maxAttempts) {
                // Lock the current code after too many wrong guesses — the account
                // owner must call resend for a fresh code (subject to its own cooldown).
                token.setUsed(true);
            }
            tokenRepository.save(token);
            throw new IllegalArgumentException("Mã xác minh không hợp lệ hoặc đã hết hạn");
        }

        token.setUsed(true);
        user.setEmailVerified(true);
        tokenRepository.save(token);
        userRepository.save(user);
    }

    @Transactional
    public void resend(String email) {
        userRepository.findByEmail(email)
                .filter(user -> !user.isEmailVerified())
                .ifPresent(user -> issueCode(user, true));
    }

    private String generateOtp() {
        return "%06d".formatted(RANDOM.nextInt(1_000_000));
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
}
