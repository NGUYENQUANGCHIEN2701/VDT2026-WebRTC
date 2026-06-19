package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;


class CallSignalingTest extends WsTestSupport {

    @Test
    void call_offer_relayed_with_received_suffix_and_server_from() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        connect(mintToken("bob"), hBob);
        WebSocketSession alice = connect(mintToken("alice"), new CollectingHandler());

        alice.sendMessage(new TextMessage("{\"type\":\"call-offer\",\"to\":\"bob\"}"));

        String frame = hBob.awaitMatching(f -> f.contains("call-offer-received"), 2000);
        assertThat(frame).as("bob phải nhận call-offer-received").isNotNull();
        assertThat(frame).contains("\"from\":\"alice\"");
    }

    @Test
    void call_accept_relayed_with_received_suffix() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), new CollectingHandler());

        bob.sendMessage(new TextMessage("{\"type\":\"call-accept\",\"to\":\"alice\"}"));

        String frame = hAlice.awaitMatching(f -> f.contains("call-accept-received"), 2000);
        assertThat(frame).isNotNull();
        assertThat(frame).contains("\"from\":\"bob\"");
    }

    @Test
    void call_cancel_relayed_with_received_suffix() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        connect(mintToken("bob"), hBob);
        WebSocketSession alice = connect(mintToken("alice"), new CollectingHandler());

        alice.sendMessage(new TextMessage("{\"type\":\"call-cancel\",\"to\":\"bob\"}"));

        String frame = hBob.awaitMatching(f -> f.contains("call-cancel-received"), 2000);
        assertThat(frame).isNotNull();
        assertThat(frame).contains("\"from\":\"alice\"");
    }

    @Test
    void hang_up_relayed_with_received_suffix() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        connect(mintToken("bob"), hBob);
        WebSocketSession alice = connect(mintToken("alice"), new CollectingHandler());

        alice.sendMessage(new TextMessage("{\"type\":\"hang-up\",\"to\":\"bob\"}"));

        String frame = hBob.awaitMatching(f -> f.contains("hang-up-received"), 2000);
        assertThat(frame).isNotNull();
        assertThat(frame).contains("\"from\":\"alice\"");
    }

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

    @Test
    void spoofed_from_is_overridden_by_principal() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        connect(mintToken("bob"), hBob);
        WebSocketSession alice = connect(mintToken("alice"), new CollectingHandler());

        alice.sendMessage(new TextMessage(
                "{\"type\":\"call-offer\",\"to\":\"bob\",\"from\":\"charlie\"}"));

        String frame = hBob.awaitMatching(f -> f.contains("call-offer-received"), 2000);
        assertThat(frame).isNotNull();
        assertThat(frame).contains("\"from\":\"alice\""); // server ghi đè
        assertThat(frame).doesNotContain("charlie"); // body giả bị bỏ
    }
}
