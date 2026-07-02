package com.vdt.webrtc.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record GoogleLoginRequest(
        @NotBlank(message = "Thông tin đăng nhập Google không được để trống")
        String credential) {
}
