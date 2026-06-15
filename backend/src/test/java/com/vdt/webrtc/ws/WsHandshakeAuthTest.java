package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

class WsHandshakeAuthTest extends WsTestSupport {

    @Test
    void connect_without_token_is_rejected() {
        // không token → handshake fail → connect() ném exception
        assertThatThrownBy(() -> connect("", new CollectingHandler()))
                .isInstanceOf(Exception.class);
    }

    @Test
    void connect_with_garbage_token_is_rejected() {
        assertThatThrownBy(() -> connect("not-a-real-jwt", new CollectingHandler()))
                .isInstanceOf(Exception.class);
    }

    @Test
    void connect_with_valid_token_succeeds() throws Exception {
        WebSocketSession session = connect(mintToken("alice"), new CollectingHandler());
        assertThat(session.isOpen()).isTrue(); // ĐỎ tới khi /ws tồn tại (Wave 2)
    }
}
