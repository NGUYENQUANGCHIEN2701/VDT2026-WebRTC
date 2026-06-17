package com.vdt.webrtc.ws;

import static org.awaitility.Awaitility.await;

import com.vdt.webrtc.TestcontainersConfiguration;
import com.vdt.webrtc.config.JwtService;
import com.vdt.webrtc.presence.LocalPresenceService;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
public abstract class WsTestSupport {

    @LocalServerPort
    protected int port; // cổng ngẫu nhiên app test đang chạy

    @Autowired
    protected JwtService jwtService; // tái dùng để tạo JWT hợp lệ

    @Autowired
    protected LocalPresenceService presence; // để chờ state drain giữa các test

    protected final StandardWebSocketClient client = new StandardWebSocketClient();

    /** Mọi session mở trong 1 test, để @AfterEach đóng sạch. */
    private final List<WebSocketSession> opened = new CopyOnWriteArrayList<>();

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
        WebSocketSession session = client.execute(handler, wsUrl(token)).get(5, TimeUnit.SECONDS);
        opened.add(session);
        return session;
    }

    /**
     * Cô lập test: đóng mọi kết nối đã mở rồi chờ presence rỗng. Singleton handler
     * giữ state trong RAM cả JVM, nên không reset thì state rò rỉ sang test kế.
     */
    @AfterEach
    void drainState() {
        for (WebSocketSession s : opened) {
            try {
                if (s.isOpen()) {
                    s.close();
                }
            } catch (Exception ignored) {
                // đóng best-effort
            }
        }
        opened.clear();
        await().atMost(Duration.ofSeconds(10))
                .until(() -> presence.snapshot().isEmpty());
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

        /**
         * Poll qua các frame (bỏ qua nhiễu như pong / snapshot trung gian) tới khi
         * gặp frame thỏa predicate; null nếu hết giờ. Hợp với mô hình full-snapshot
         * eventually-consistent: chờ state HỘI TỤ, không bắt đúng 1 frame.
         */
        public String awaitMatching(Predicate<String> predicate, long timeoutMs) throws InterruptedException {
            long deadline = System.currentTimeMillis() + timeoutMs;
            String frame;
            while ((frame = messages.poll(Math.max(0, deadline - System.currentTimeMillis()),
                    TimeUnit.MILLISECONDS)) != null) {
                if (predicate.test(frame)) {
                    return frame;
                }
            }
            return null;
        }

        /** Drain mọi frame đang chờ (non-blocking); true nếu có frame nào thỏa predicate. */
        public boolean drainMatching(Predicate<String> predicate) {
            boolean found = false;
            String frame;
            while ((frame = messages.poll()) != null) {
                if (predicate.test(frame)) {
                    found = true;
                }
            }
            return found;
        }
    }
}
