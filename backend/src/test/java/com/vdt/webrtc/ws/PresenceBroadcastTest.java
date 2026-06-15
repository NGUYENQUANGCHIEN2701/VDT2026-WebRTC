package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

class PresenceBroadcastTest extends WsTestSupport {

    @Test
    void both_clients_see_snapshot_then_update_on_leave() throws Exception {
        WebSocketSession alice = connect(mintToken("alice"), new CollectingHandler());
        CollectingHandler hBob = new CollectingHandler();
        connect(mintToken("bob"), hBob);

        // bob nhận snapshot chứa CẢ hai
        String snapshot = hBob.awaitMessage(2000);
        assertThat(snapshot).contains("alice").contains("bob");

        // alice rời đi → bob nhận snapshot mới KHÔNG còn alice
        alice.close();
        String updated = hBob.awaitMessage(2000);
        assertThat(updated).contains("presence").doesNotContain("alice");
    }
}
