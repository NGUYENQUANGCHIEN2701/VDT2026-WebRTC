package com.vdt.webrtc.ws;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import com.vdt.webrtc.config.JwtService;

@Configuration
@EnableWebSocket
@EnableScheduling
public class WebSocketConfig implements WebSocketConfigurer {

    private final PresenceWebSocketHandler handler;
    private final JwtService jwtService;

    // Origin được phép bắt tay WS. Mặc định cả http+https localhost (dev HTTP & HTTPS);
    // thêm origin IP LAN (https) qua env ALLOWED_ORIGINS khi demo 2 thiết bị. KHÔNG dùng "*".
    @Value("${app.allowed-origins:http://localhost:5173,https://localhost:5173}")
    private String[] allowedOrigins;

    public WebSocketConfig(PresenceWebSocketHandler handler, JwtService jwtService) {
        this.handler = handler;
        this.jwtService = jwtService;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws")
                .addInterceptors(new JwtHandshakeInterceptor(jwtService))
                .setAllowedOrigins(allowedOrigins);
    }
}
