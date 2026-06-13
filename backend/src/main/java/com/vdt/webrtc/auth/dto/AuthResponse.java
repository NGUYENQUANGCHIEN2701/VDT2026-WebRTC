package com.vdt.webrtc.auth.dto;

public record AuthResponse(String token, String username, String role) {
}