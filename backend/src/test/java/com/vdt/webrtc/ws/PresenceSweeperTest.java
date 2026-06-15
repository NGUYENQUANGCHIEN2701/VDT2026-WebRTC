package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

class PresenceSweeperTest extends WsTestSupport {

    @Test
    void user_that_stops_heartbeat_is_swept_offline() throws Exception {
        // bob = người quan sát (vẫn sống nhờ tự ping trong vòng lặp)
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession bob = connect(mintToken("bob"), hBob);

        // alice kết nối rồi KHÔNG bao giờ ping → sẽ bị quét
        connect(mintToken("alice"), new CollectingHandler());

        await().atMost(Duration.ofSeconds(80))
                .pollInterval(Duration.ofSeconds(5))
                .until(() -> {
                    bob.sendMessage(new TextMessage("{\"type\":\"ping\"}")); // giữ bob sống
                    String frame = hBob.awaitMessage(2000);
                    return frame != null && frame.contains("presence") && !frame.contains("alice");
                });
    }
}
