package com.vdt.webrtc.config;

import java.nio.charset.StandardCharsets;
import java.util.Date;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

@Service
public class JwtService {
    private final String secret;
    private final long accessTokenTtlMs;

    public JwtService(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.access-token-ttl-ms}") long accessTokenTtlMs) {
        this.secret = secret;
        this.accessTokenTtlMs = accessTokenTtlMs;
    }

    // jjwt requires a SecretKey for signing, so we convert the string secret to a
    // SecretKey
    private SecretKey signingKey() {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    // Generate a JWT token with username and role claims
    public String generateToken(String username, String role) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + accessTokenTtlMs);

        return Jwts.builder()
                .subject(username)
                .claim("role", role)
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(signingKey())
                .compact();
    }

    // Extract the username (subject) from the JWT token
    public String extractUsername(String token) {
        return parseClaims(token).getSubject();
    }

    // Verify the token
    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    // Check if the token is valid (not expired and signature is correct)
    public boolean isTokenValid(String token) {
        try {
            parseClaims(token); 
            return true;
        } catch (Exception e) {
            return false; // sai chữ ký / hết hạn / format hỏng
        }
    }

}
