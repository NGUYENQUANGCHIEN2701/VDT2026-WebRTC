package com.vdt.webrtc.auth;

public class EmailNotVerifiedException extends RuntimeException {
    private final String email;

    public EmailNotVerifiedException(String email) {
        super("Email chưa được xác minh");
        this.email = email;
    }

    public String getEmail() {
        return email;
    }
}
