package com.vdt.webrtc.ws;

import static org.awaitility.Awaitility.await;
import java.time.Duration;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

@Disabled("Re-enable in Wave 2 — sweeper is now Redis-driven; presence keys written by RedisPresenceService")
class PresenceSweeperTest extends WsTestSupport {

    @Test
    void user_that_stops_heartbeat_is_swept_offline() throws Exception {
        // bob = người quan sát (vẫn sống nhờ tự ping trong vòng lặp)
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession bob = connect(mintToken("bob"), hBob);

        // alice kết nối rồi KHÔNG bao giờ ping → sẽ bị quét
        connect(mintToken("alice"), new CollectingHandler());

        // 1. xác nhận alice đã thực sự online (xuất hiện trong 1 snapshot) — tránh
        // false-positive từ snapshot [bob] lúc bob join trước khi alice vào.
        await().atMost(Duration.ofSeconds(5))
                .until(() -> hBob.drainMatching(f -> f.contains("alice")));

        // 2. alice ngừng heartbeat → sweeper quét alice khỏi snapshot trong ~60-80s
        await().atMost(Duration.ofSeconds(90))
                .pollInterval(Duration.ofSeconds(5))
                .until(() -> {
                    bob.sendMessage(new TextMessage("{\"type\":\"ping\"}")); // giữ bob sống
                    return hBob.drainMatching(f -> f.contains("presence") && !f.contains("alice"));
                });
    }
}
