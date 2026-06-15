package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

// Test xác nhận server gắn danh tính từ token, không tin body "from" giả mạo.
class WsIdentityTest extends WsTestSupport {

    @Test
    void server_uses_token_identity_not_body_from() throws Exception {
        WebSocketSession alice = connect(mintToken("alice"), new CollectingHandler());
        CollectingHandler hBob = new CollectingHandler();
        connect(mintToken("bob"), hBob);

        // alice gửi message GIẢ DANH from:"bob"
        alice.sendMessage(new TextMessage("{\"type\":\"ping\",\"from\":\"bob\"}"));

        // snapshot vẫn phản ánh "alice" (server gắn danh tính từ token, kệ body)
        String frame = hBob.awaitMessage(2000);
        assertThat(frame).contains("alice");
    }
}