package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

// grace ngắn (3s) để test recovery không phải chờ 15s; ring-timeout đủ dài để accept kịp.
@TestPropertySource(properties = {
        "call.ring-timeout-seconds=5",
        "call.grace-period-seconds=3"
})
class CallRecoveryTest extends WsTestSupport {

    @Autowired
    StringRedisTemplate redis;

    @BeforeEach
    void flushRedis() { // Redis sạch mỗi test (call-state không rò sang test kế)
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    private static String callIdOf(String frame) {
        Matcher m = Pattern.compile("\"callId\":\"([^\"]+)\"").matcher(frame);
        assertThat(m.find()).as("frame phải có callId: " + frame).isTrue();
        return m.group(1);
    }

    // alice gọi bob → accept → cả hai active. Trả callId.
    private String activeCall(WebSocketSession alice, CollectingHandler hAlice,
            WebSocketSession bob, CollectingHandler hBob) throws Exception {
        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));
        String callId = callIdOf(hBob.awaitMatching(f -> f.contains("\"state\":\"ringing\""), 3000));
        bob.sendMessage(new TextMessage("{\"type\":\"call-accept\",\"callId\":\"" + callId + "\"}"));
        hAlice.awaitMatching(f -> f.contains("\"state\":\"active\""), 3000);
        hBob.awaitMatching(f -> f.contains("\"state\":\"active\""), 3000);
        return callId;
    }

    // Rớt WS khi đang active → KHÔNG dropped ngay, phải hết grace mới dropped (cả hai bên).
    @Test
    void disconnectDuringActive_dropsOnlyAfterGrace() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);
        activeCall(alice, hAlice, bob, hBob);

        bob.close(); // giả lập rớt WS (đóng tab / mất mạng)

        // Trước khi hết grace (3s): alice CHƯA được nhận dropped
        assertThat(hAlice.awaitMatching(f -> f.contains("\"reason\":\"dropped\""), 1500))
                .as("chưa hết grace thì chưa dropped").isNull();

        // Sau grace: alice nhận ended/dropped
        assertThat(hAlice.awaitMatching(f -> f.contains("\"reason\":\"dropped\""), 4000))
                .as("hết grace mà chưa nối lại → dropped").isNotNull();
    }

    // Rớt rồi NỐI LẠI trong grace → cuộc không bị dropped + client quay lại nhận resync 'active'.
    @Test
    void reconnectWithinGrace_keepsCall_andResyncs() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);
        activeCall(alice, hAlice, bob, hBob);

        bob.close(); // rớt

        // Nối lại NGAY (trong grace 3s) bằng handler mới — như F5 xong tải lại
        CollectingHandler hBob2 = new CollectingHandler();
        connect(mintToken("bob"), hBob2);

        // bob nối lại nhận resync 'active'
        assertThat(hBob2.awaitMatching(
                f -> f.contains("call-state-changed") && f.contains("\"state\":\"active\""), 3000))
                .as("bob nối lại phải nhận resync active").isNotNull();

        // alice KHÔNG bị dropped (chờ qua mốc grace cho chắc grace đã bị hủy)
        assertThat(hAlice.awaitMatching(f -> f.contains("\"reason\":\"dropped\""), 4000))
                .as("nối lại trong grace → cuộc được cứu, không dropped").isNull();
    }
}
