package com.vdt.webrtc.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record ForgotPasswordRequest(
        @NotBlank(message = "Email cannot be blank")
        @Email(message = "Email must be valid")
        String email) {
}
