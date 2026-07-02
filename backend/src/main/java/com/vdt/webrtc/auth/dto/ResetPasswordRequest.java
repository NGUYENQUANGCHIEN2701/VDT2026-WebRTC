package com.vdt.webrtc.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank(message = "Reset token cannot be blank")
        String token,

        @NotBlank(message = "Password cannot be blank")
        @Size(min = 8, message = "Password must be at least 8 characters")
        @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "Password must contain at least one letter and one number")
        String password,

        @NotBlank(message = "Password confirmation cannot be blank")
        String confirmPassword) {
}
