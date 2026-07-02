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

    public EmailVerificationService(
            UserRepository userRepository,
            EmailVerificationTokenRepository tokenRepository,
            EmailDeliveryService emailDeliveryService,
            @Value("${app.email-verification.auto-verify-domains:}") String autoVerifyDomains) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.emailDeliveryService = emailDeliveryService;
        this.autoVerifyDomains = Arrays.stream(autoVerifyDomains.split(","))
                .map(String::trim)
                .map(String::toLowerCase)
                .filter(domain -> !domain.isBlank())
                .collect(Collectors.toUnmodifiableSet());
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
                        throw new IllegalArgumentException("Please wait before requesting another verification code");
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

    @Transactional
    public void verify(String email, String otp) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Verification code is invalid or expired"));

        if (user.isEmailVerified()) {
            return;
        }

        EmailVerificationToken token = tokenRepository.findByUserAndCodeHashAndUsedFalse(user, sha256Hex(otp))
                .orElseThrow(() -> new IllegalArgumentException("Verification code is invalid or expired"));

        if (token.getExpiresAt().isBefore(Instant.now())) {
            token.setUsed(true);
            tokenRepository.save(token);
            throw new IllegalArgumentException("Verification code is invalid or expired");
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
