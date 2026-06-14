package com.vdt.webrtc.auth;

public record LoginResult (String accessToken, String username, String role, String rawRefreshToken) {
}
