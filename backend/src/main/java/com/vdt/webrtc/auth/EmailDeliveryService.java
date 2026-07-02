package com.vdt.webrtc.auth;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class EmailDeliveryService {
    private final ObjectProvider<JavaMailSender> mailSender;
    private final String from;
    private final boolean configured;

    public EmailDeliveryService(
            ObjectProvider<JavaMailSender> mailSender,
            @Value("${spring.mail.username:}") String username,
            @Value("${spring.mail.password:}") String password) {
        this.mailSender = mailSender;
        this.from = username;
        this.configured = username != null && !username.isBlank() && password != null && !password.isBlank();
    }

    public void sendVerificationCode(String to, String code) {
        String body = """
                Your VDT WebRTC verification code is %s.

                This code expires in 10 minutes.
                """.formatted(code);
        send(to, "Verify your VDT WebRTC email", body);
    }

    public void sendPasswordResetLink(String to, String resetLink) {
        String body = """
                Use this link to reset your VDT WebRTC password:

                %s

                The link expires in 15 minutes. If you did not request this, you can ignore this email.
                """.formatted(resetLink);
        send(to, "Reset your VDT WebRTC password", body);
    }

    private void send(String to, String subject, String body) {
        if (!configured) {
            log.info("Email delivery is not configured; would send '{}' to {} with body:\n{}", subject, to, body);
            return;
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject(subject);
        message.setText(body);
        mailSender.getObject().send(message);
    }
}
