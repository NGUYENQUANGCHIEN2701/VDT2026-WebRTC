package com.vdt.webrtc.auth;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class GoogleTokenVerifier {
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String clientId;

    public GoogleTokenVerifier(ObjectMapper objectMapper,
            @Value("${google.client-id:}") String clientId) {
        this.objectMapper = objectMapper;
        this.clientId = clientId;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build();
    }

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank();
    }

    public GoogleIdentity verify(String credential) {
        if (!isConfigured()) {
            throw new IllegalArgumentException("Đăng nhập Google chưa được cấu hình");
        }

        String encoded = URLEncoder.encode(credential, StandardCharsets.UTF_8);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://oauth2.googleapis.com/tokeninfo?id_token=" + encoded))
                .timeout(Duration.ofSeconds(5))
                .GET()
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new IllegalArgumentException("Thông tin đăng nhập Google không hợp lệ");
            }

            JsonNode body = objectMapper.readTree(response.body());
            String audience = text(body, "aud");
            String subject = text(body, "sub");
            String email = text(body, "email");
            String verified = text(body, "email_verified");
            String name = text(body, "name");

            if (!clientId.equals(audience) || subject.isBlank() || email.isBlank()
                    || !"true".equalsIgnoreCase(verified)) {
                throw new IllegalArgumentException("Thông tin đăng nhập Google không hợp lệ");
            }

            return new GoogleIdentity(subject, email, name);
        } catch (IOException e) {
            throw new IllegalArgumentException("Không thể xác minh thông tin đăng nhập Google");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalArgumentException("Không thể xác minh thông tin đăng nhập Google");
        }
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? "" : value.asString();
    }
}
