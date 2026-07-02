package com.vdt.webrtc.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record GoogleLoginRequest(
        @NotBlank(message = "Google credential cannot be blank")
        String credential) {
}
