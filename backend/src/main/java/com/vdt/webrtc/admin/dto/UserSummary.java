package com.vdt.webrtc.admin.dto;

public record UserSummary(
        Long id,
        String username,
        String email,
        String role,
        boolean locked) {

}
