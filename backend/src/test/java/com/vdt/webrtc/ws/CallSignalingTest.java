package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

// Media plane: SDP/ICE vẫn relay mù qua server (như Phase 3).
// Lifecycle (offer/accept/reject/cancel/hangup) đã chuyển sang control plane → xem CallLifecycleTest.
class CallSignalingTest extends WsTestSupport {

    @Test
    void sdp_relayed_opaque_with_received_suffix() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        connect(mintToken("bob"), hBob);
        WebSocketSession alice = connect(mintToken("alice"), new CollectingHandler());

        alice.sendMessage(new TextMessage(
                "{\"type\":\"sdp\",\"to\":\"bob\",\"callId\":\"call-1\","
                        + "\"sdp\":{\"type\":\"offer\",\"sdp\":\"v=0-opaque\"}}"));

        String frame = hBob.awaitMatching(f -> f.contains("sdp-received"), 2000);
        assertThat(frame).isNotNull();
        assertThat(frame).contains("\"from\":\"alice\"");
        assertThat(frame).contains("\"callId\":\"call-1\"");
        assertThat(frame).contains("v=0-opaque"); // server KHÔNG parse media → đi opaque
    }
}
