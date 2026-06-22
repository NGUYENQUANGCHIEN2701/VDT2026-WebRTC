package com.vdt.webrtc.call;

import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.Base64;
import java.util.List;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@RestController
@RequestMapping("/api")
public class TurnController {
    private final String secret;
    private final String server;
    private final long ttlSeconds;

    public TurnController(@Value("${turn.secret}") String secret, @Value("${turn.server}") String server,
            @Value("${turn.credential-ttl-seconds:86400}") long ttlSeconds) {
        this.secret = secret;
        this.server = server;
        this.ttlSeconds = ttlSeconds;
    }

    @GetMapping("/turn-credentials")
    public TurnCredentialsResponse getCredentials(Authentication authentication) {
        long expiry = Instant.now().getEpochSecond() + ttlSeconds; // hết hạn
        String username = expiry + ":" + authentication.getName(); // "expiry:alice"
        String credential = hmacSha1Base64(secret, username); // ký
        return new TurnCredentialsResponse(
                List.of("stun:" + server, "turn:" + server), username, credential);
    }

    private static String hmacSha1Base64(String secret, String data) { 
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            return Base64.getEncoder().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) { // gói cả NoSuchAlgorithm + InvalidKey
            throw new IllegalStateException("Không tính được TURN credential", e);
        }
    }

}
