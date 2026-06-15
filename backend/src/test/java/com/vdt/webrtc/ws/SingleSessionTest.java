package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;

class SingleSessionTest extends WsTestSupport {

    @Test
    void second_login_supersedes_first_session() throws Exception {
        CollectingHandler h1 = new CollectingHandler();
        connect(mintToken("alice"), h1); // session 1

        connect(mintToken("alice"), new CollectingHandler()); // CÙNG user → đá session 1

        String frame = h1.awaitMessage(3000);
        assertThat(frame).contains("session-superseded"); // tab cũ nhận lệnh đá
    }
}
