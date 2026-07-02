package com.vdt.webrtc.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record VerifyEmailRequest(
        @Email @NotBlank String email,
        @NotBlank @Pattern(regexp = "\\d{6}", message = "OTP phải gồm đúng 6 chữ số") String otp) {
}
