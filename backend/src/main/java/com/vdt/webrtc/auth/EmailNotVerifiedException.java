package com.vdt.webrtc.auth;

public class EmailNotVerifiedException extends RuntimeException {
    private final String email;

    public EmailNotVerifiedException(String email) {
        super("Email is not verified");
        this.email = email;
    }

    public String getEmail() {
        return email;
    }
}
