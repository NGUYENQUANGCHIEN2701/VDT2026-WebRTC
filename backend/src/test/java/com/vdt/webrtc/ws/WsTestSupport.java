package com.vdt.webrtc.ws;

import com.vdt.webrtc.TestcontainersConfiguration;
import com.vdt.webrtc.config.JwtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
public abstract class WsTestSupport {

    @LocalServerPort
    protected int port; // cổng ngẫu nhiên app test đang chạy

    @Autowired
    protected JwtService jwtService; // tái dùng để tạo JWT hợp lệ

    protected final StandardWebSocketClient client = new StandardWebSocketClient();

    /** Tạo token thật (server chấp nhận) cho 1 username test. */
    protected String mintToken(String username) {
        return jwtService.generateToken(username, "USER");
    }

    /** URL WS có token ở query param (D-01/RESEARCH Pattern 1). */
    protected String wsUrl(String token) {
        return "ws://localhost:" + port + "/ws?token=" + token;
    }

    /** Mở 1 kết nối WS; ném exception nếu handshake bị từ chối. */
    protected WebSocketSession connect(String token, CollectingHandler handler) throws Exception {
        return client.execute(handler, wsUrl(token)).get(5, TimeUnit.SECONDS);
    }

    /**
     * Client thu thập message: nhét mọi frame nhận được vào hàng đợi để test await
     * + assert.
     */
    protected static class CollectingHandler extends TextWebSocketHandler {
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            messages.add(message.getPayload());
        }

        /** Chờ tối đa timeoutMs để lấy frame kế tiếp; null nếu hết giờ. */
        public String awaitMessage(long timeoutMs) throws InterruptedException {
            return messages.poll(timeoutMs, TimeUnit.MILLISECONDS);
        }
    }
}
