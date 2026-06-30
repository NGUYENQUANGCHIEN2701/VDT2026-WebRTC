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

/**
 * RED tests cho recording-state relay (ADV-02 / Phase 8).
 *
 * Khi user A record, họ gửi recording-state lên server.
 * Server phải kiểm tra A và B có đang trong một cuộc gọi active không,
 * rồi mới relay recording-state-relay cho B.
 *
 * Tất cả test này sẽ FAIL (compile ok, nhưng fail runtime) vì:
 *   - RecordingState và RecordingStateRelay chưa tồn tại → handler không nhận ra type
 *   - areActiveCallPeers chưa được gọi trong handler
 *   - recording-state-relay chưa được relay
 *
 * Đây là thiết kế đúng của TDD: test đỏ trước, implementation sau.
 */
@TestPropertySource(properties = "call.ring-timeout-seconds=3")
class RecordingSignalingTest extends WsTestSupport {

    @Autowired
    StringRedisTemplate redis;

    @BeforeEach
    void flushRedis() {
        // Mỗi test bắt đầu với Redis sạch — call-state không rò sang test kế
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    // ──────────────────────────────────────────────────────────
    // Helper: đọc callId từ frame JSON (server sinh callId)
    // ──────────────────────────────────────────────────────────

    private static String callIdOf(String frame) {
        Matcher m = Pattern.compile("\"callId\":\"([^\"]+)\"").matcher(frame);
        assertThat(m.find()).as("frame phải có callId: " + frame).isTrue();
        return m.group(1);
    }

    /**
     * Helper: đưa alice và bob vào trạng thái active call.
     * Trả về callId để các test dùng tiếp.
     */
    private String setupActiveCall(WebSocketSession alice, WebSocketSession bob,
            CollectingHandler hBob) throws Exception {
        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));
        String callId = callIdOf(hBob.awaitMatching(f -> f.contains("\"state\":\"ringing\""), 3000));
        bob.sendMessage(new TextMessage("{\"type\":\"call-accept\",\"callId\":\"" + callId + "\"}"));
        // Chờ active — cả 2 phải nhận được
        hBob.awaitMatching(f -> f.contains("\"state\":\"active\""), 3000);
        return callId;
    }

    // ══════════════════════════════════════════════════════════
    // Test 1 — Happy path: caller gửi recording=true → callee nhận relay
    // ══════════════════════════════════════════════════════════

    @Test
    void activeCaller_sendsRecordingTrue_calleeReceivesRelay() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob   = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob   = connect(mintToken("bob"),   hBob);

        String callId = setupActiveCall(alice, bob, hBob);

        // alice bắt đầu record và báo cho bob
        alice.sendMessage(new TextMessage(
                "{\"type\":\"recording-state\",\"to\":\"bob\",\"callId\":\"" + callId + "\",\"recording\":true}"));

        // bob PHẢI nhận recording-state-relay với from=alice, recording=true
        String relay = hBob.awaitMatching(f -> f.contains("recording-state-relay"), 2000);
        assertThat(relay).as("bob phải nhận recording-state-relay").isNotNull();
        assertThat(relay).contains("\"from\":\"alice\"");
        assertThat(relay).contains("\"recording\":true");
        assertThat(relay).contains("\"callId\":\"" + callId + "\"");

        // alice KHÔNG nhận relay về chính mình
        assertThat(hAlice.awaitMatching(f -> f.contains("recording-state-relay"), 500)).isNull();
    }

    // ══════════════════════════════════════════════════════════
    // Test 2 — Happy path: callee gửi recording=true → caller nhận relay
    //          (chiều ngược: đối xứng, cả 2 chiều phải hoạt động)
    // ══════════════════════════════════════════════════════════

    @Test
    void activeCallee_sendsRecordingTrue_callerReceivesRelay() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob   = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob   = connect(mintToken("bob"),   hBob);

        String callId = setupActiveCall(alice, bob, hBob);

        // bob là callee, bob bắt đầu record
        bob.sendMessage(new TextMessage(
                "{\"type\":\"recording-state\",\"to\":\"alice\",\"callId\":\"" + callId + "\",\"recording\":true}"));

        // alice PHẢI nhận relay
        String relay = hAlice.awaitMatching(f -> f.contains("recording-state-relay"), 2000);
        assertThat(relay).as("alice phải nhận recording-state-relay từ bob").isNotNull();
        assertThat(relay).contains("\"from\":\"bob\"");
        assertThat(relay).contains("\"recording\":true");
    }

    // ══════════════════════════════════════════════════════════
    // Test 3 — recording=false (stop) vẫn relay bình thường
    //          (server không phân biệt giá trị boolean, chỉ check membership)
    // ══════════════════════════════════════════════════════════

    @Test
    void activePeer_sendsRecordingFalse_calleeReceivesRelayWithFalse() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob   = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob   = connect(mintToken("bob"),   hBob);

        String callId = setupActiveCall(alice, bob, hBob);

        // alice stop record
        alice.sendMessage(new TextMessage(
                "{\"type\":\"recording-state\",\"to\":\"bob\",\"callId\":\"" + callId + "\",\"recording\":false}"));

        String relay = hBob.awaitMatching(f -> f.contains("recording-state-relay"), 2000);
        assertThat(relay).as("bob phải nhận relay ngay cả khi recording=false").isNotNull();
        assertThat(relay).contains("\"recording\":false");
    }

    // ══════════════════════════════════════════════════════════
    // Test 4 — Người không trong call gửi recording-state → KHÔNG relay
    //          (carol là outsider cố inject recording indicator vào call alice-bob)
    // ══════════════════════════════════════════════════════════

    @Test
    void outsider_sendsRecordingState_notRelayed() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob   = new CollectingHandler();
        CollectingHandler hCarol = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob   = connect(mintToken("bob"),   hBob);
        WebSocketSession carol = connect(mintToken("carol"), hCarol);

        String callId = setupActiveCall(alice, bob, hBob);

        // carol cố relay vào call alice-bob mà carol không tham gia
        carol.sendMessage(new TextMessage(
                "{\"type\":\"recording-state\",\"to\":\"bob\",\"callId\":\"" + callId + "\",\"recording\":true}"));

        // bob KHÔNG ĐƯỢC nhận relay từ carol
        String relay = hBob.awaitMatching(f -> f.contains("recording-state-relay"), 1000);
        assertThat(relay).as("outsider carol không được relay recording-state tới bob").isNull();
    }

    // ══════════════════════════════════════════════════════════
    // Test 5 — Gửi đúng callId nhưng chỉ định sai "to" (người thứ 3)
    //          (alice đang call bob, alice gửi recording-state to=carol)
    // ══════════════════════════════════════════════════════════

    @Test
    void participant_sendsRecordingState_toThirdParty_notRelayed() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob   = new CollectingHandler();
        CollectingHandler hCarol = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob   = connect(mintToken("bob"),   hBob);
        connect(mintToken("carol"), hCarol);

        String callId = setupActiveCall(alice, bob, hBob);

        // alice trong call nhưng chỉ định to=carol (không trong call)
        alice.sendMessage(new TextMessage(
                "{\"type\":\"recording-state\",\"to\":\"carol\",\"callId\":\"" + callId + "\",\"recording\":true}"));

        // carol KHÔNG ĐƯỢC nhận relay — carol không phải peer trong callId này
        String relay = hCarol.awaitMatching(f -> f.contains("recording-state-relay"), 1000);
        assertThat(relay).as("carol không phải peer trong call — không được nhận relay").isNull();

        // bob cũng không nhận (alice gửi sai to)
        assertThat(hBob.awaitMatching(f -> f.contains("recording-state-relay"), 500)).isNull();
    }

    // ══════════════════════════════════════════════════════════
    // Test 6 — Call đang ringing (chưa active) → KHÔNG relay
    //          (recording chỉ có nghĩa khi call đang active)
    // ══════════════════════════════════════════════════════════

    @Test
    void ringingCall_sendsRecordingState_notRelayed() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob   = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob   = connect(mintToken("bob"),   hBob);

        // Gửi invite nhưng bob KHÔNG accept → trạng thái là ringing
        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));
        String callId = callIdOf(hBob.awaitMatching(f -> f.contains("\"state\":\"ringing\""), 3000));

        // alice thử gửi recording-state trong lúc ringing
        alice.sendMessage(new TextMessage(
                "{\"type\":\"recording-state\",\"to\":\"bob\",\"callId\":\"" + callId + "\",\"recording\":true}"));

        // bob KHÔNG được nhận relay — call chưa active
        String relay = hBob.awaitMatching(f -> f.contains("recording-state-relay"), 1000);
        assertThat(relay).as("call đang ringing — recording-state không được relay").isNull();
    }
}
