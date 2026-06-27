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

// ring-timeout ngắn để test "missed" không phải chờ 30s; vẫn đủ dài cho accept/cancel chạy kịp
@TestPropertySource(properties = "call.ring-timeout-seconds=3")
class CallLifecycleTest extends WsTestSupport {

    @Autowired
    StringRedisTemplate redis;

    @BeforeEach
    void flushRedis() { // mỗi test bắt đầu với Redis sạch (call-state không rò sang test kế)
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    // moi callId từ một frame JSON (server sinh callId → client phải đọc lại)
    private static String callIdOf(String frame) {
        Matcher m = Pattern.compile("\"callId\":\"([^\"]+)\"").matcher(frame);
        assertThat(m.find()).as("frame phải có callId: " + frame).isTrue();
        return m.group(1);
    }

    // alice gọi bob → CẢ HAI thấy ringing, callerId=alice
    @Test
    void invite_makesBothRing() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        connect(mintToken("bob"), hBob);

        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));

        String bobFrame = hBob.awaitMatching(
                f -> f.contains("call-state-changed") && f.contains("\"state\":\"ringing\""), 3000);
        assertThat(bobFrame).as("bob phải nhận ringing").isNotNull();
        assertThat(bobFrame).contains("\"callerId\":\"alice\"");
        assertThat(hAlice.awaitMatching(f -> f.contains("\"state\":\"ringing\""), 3000)).isNotNull();
    }

    // bob nhận máy → cả hai thấy active
    @Test
    void accept_makesActive() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);

        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));
        String callId = callIdOf(hBob.awaitMatching(f -> f.contains("\"state\":\"ringing\""), 3000));

        bob.sendMessage(new TextMessage("{\"type\":\"call-accept\",\"callId\":\"" + callId + "\"}"));

        assertThat(hAlice.awaitMatching(f -> f.contains("\"state\":\"active\""), 3000)).isNotNull();
        assertThat(hBob.awaitMatching(f -> f.contains("\"state\":\"active\""), 3000)).isNotNull();
    }

    // alice hủy khi đang đổ chuông → cả hai thấy ended{cancelled}
    @Test
    void callerCancel_endsAsCancelled() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        connect(mintToken("bob"), hBob);

        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));
        String callId = callIdOf(hBob.awaitMatching(f -> f.contains("\"state\":\"ringing\""), 3000));

        alice.sendMessage(new TextMessage("{\"type\":\"call-cancel\",\"callId\":\"" + callId + "\"}"));

        assertThat(hBob.awaitMatching(f -> f.contains("\"reason\":\"cancelled\""), 3000)).isNotNull();
        assertThat(hAlice.awaitMatching(f -> f.contains("\"reason\":\"cancelled\""), 3000)).isNotNull();
    }

    // bob từ chối → cả hai thấy ended{rejected}
    @Test
    void calleeReject_endsAsRejected() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);

        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));
        String callId = callIdOf(hBob.awaitMatching(f -> f.contains("\"state\":\"ringing\""), 3000));

        bob.sendMessage(new TextMessage("{\"type\":\"call-reject\",\"callId\":\"" + callId + "\"}"));

        assertThat(hAlice.awaitMatching(f -> f.contains("\"reason\":\"rejected\""), 3000)).isNotNull();
        assertThat(hBob.awaitMatching(f -> f.contains("\"reason\":\"rejected\""), 3000)).isNotNull();
    }

    // gọi người đang bận → caller nhận busy, callee KHÔNG reo
    @Test
    void invitingBusyUser_returnsBusy_withoutRingingCallee() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        CollectingHandler hCarol = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), new CollectingHandler());
        connect(mintToken("bob"), hBob);
        WebSocketSession carol = connect(mintToken("carol"), hCarol);

        // alice gọi bob → bob đang ringing = đang bận
        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));
        hBob.awaitMatching(f -> f.contains("\"state\":\"ringing\""), 3000);

        // carol gọi bob → busy
        carol.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));
        assertThat(hCarol.awaitMatching(f -> f.contains("\"reason\":\"busy\""), 3000))
                .as("carol phải nhận busy").isNotNull();
        // bob KHÔNG được reo vì carol
        assertThat(hBob.awaitMatching(f -> f.contains("\"callerId\":\"carol\""), 1000)).isNull();
    }

    // không ai nhận sau ring-timeout → cả hai thấy ended{missed}
    @Test
    void unanswered_timesOutAsMissed() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        connect(mintToken("bob"), hBob);

        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));
        // không accept; ring-timeout=3s → missed
        assertThat(hAlice.awaitMatching(f -> f.contains("\"reason\":\"missed\""), 6000)).isNotNull();
        assertThat(hBob.awaitMatching(f -> f.contains("\"reason\":\"missed\""), 6000)).isNotNull();
    }

    // cúp khi đang nói → cả hai thấy ended{completed}
    @Test
    void hangup_endsAsCompleted() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);

        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));
        String callId = callIdOf(hBob.awaitMatching(f -> f.contains("\"state\":\"ringing\""), 3000));
        bob.sendMessage(new TextMessage("{\"type\":\"call-accept\",\"callId\":\"" + callId + "\"}"));
        hAlice.awaitMatching(f -> f.contains("\"state\":\"active\""), 3000);

        alice.sendMessage(new TextMessage("{\"type\":\"hang-up\",\"callId\":\"" + callId + "\"}"));

        assertThat(hBob.awaitMatching(f -> f.contains("\"reason\":\"completed\""), 3000)).isNotNull();
        assertThat(hAlice.awaitMatching(f -> f.contains("\"reason\":\"completed\""), 3000)).isNotNull();
    }
}
