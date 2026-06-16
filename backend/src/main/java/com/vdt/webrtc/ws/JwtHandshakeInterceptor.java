package com.vdt.webrtc.ws;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import com.vdt.webrtc.config.JwtService;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class JwtHandshakeInterceptor implements HandshakeInterceptor {

    private final JwtService jwtService;

    public JwtHandshakeInterceptor(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    // Trước khi chấp nhận kết nối WebSocket, interceptor này sẽ kiểm tra token JWT
    // trong query parameter.
    // Nếu token hợp lệ, nó sẽ trích xuất username và lưu vào attributes để sau này
    // WebSocketHandler có thể sử dụng.
    // Nếu token không hợp lệ, nó sẽ từ chối kết nối bằng cách trả về false.
    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Map<String, Object> attributes) {

        String token = UriComponentsBuilder.fromUri(request.getURI())
                .build()
                .getQueryParams()
                .getFirst("token");
        if (token == null || token.isBlank() || !jwtService.isTokenValid(token)) {
            log.warn("WS handshake bị từ chối: token thiếu hoặc không hợp lệ");
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        attributes.put("username", jwtService.extractUsername(token));
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Exception exception) {
        // không cần làm gì
    }
}
