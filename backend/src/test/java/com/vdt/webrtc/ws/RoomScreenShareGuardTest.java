package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/**
 * RED tests cho server-authoritative single-sharer guard trong room (quick
 * task 260701-u3j).
 *
 * Mục tiêu: chỉ MỘT participant trong room được ở trạng thái
 * isScreenSharing=true tại một thời điểm; server phải xác nhận (claim) qua
 * Redis atomic script trước khi relay isScreenSharing=true cho các member
 * khác. 1-1 CallService MediaState path (không có room) phải không đổi.
 */
class RoomScreenShareGuardTest extends WsTestSupport {

    @Autowired
    StringRedisTemplate redis;

    @BeforeEach
    void flushRedis() {
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    /** Đưa alice, bob, carol vào cùng 1 room; trả về roomId. */
    private String joinRoomOfThree(WebSocketSession alice, WebSocketSession bob, WebSocketSession carol,
            CollectingHandler hBob, CollectingHandler hCarol) throws Exception {
        alice.sendMessage(new TextMessage("{\"type\":\"group-invite\",\"to\":[\"bob\",\"carol\"]}"));
        String roomId = jsonString(
                hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-invite\""), 3000),
                "roomId");

        bob.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));
        assertThat(hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-joined\""), 3000)).isNotNull();
        carol.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));
        assertThat(hCarol.awaitMatching(frame -> frame.contains("\"type\":\"room-joined\""), 3000)).isNotNull();

        return roomId;
    }

    @Test
    void firstSharerInRoom_getsIsScreenSharingTrueRelayedToAllOtherMembers() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        CollectingHandler hCarol = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);
        WebSocketSession carol = connect(mintToken("carol"), hCarol);

        joinRoomOfThree(alice, bob, carol, hBob, hCarol);

        alice.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"bob\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));
        alice.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"carol\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));

        String toBob = hBob.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\""), 3000);
        assertThat(toBob).as("bob should receive alice's sharer claim").isNotNull();
        assertThat(toBob).contains("\"from\":\"alice\"");
        assertThat(toBob).contains("\"isScreenSharing\":true");

        String toCarol = hCarol.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\""), 3000);
        assertThat(toCarol).as("carol should receive alice's sharer claim").isNotNull();
        assertThat(toCarol).contains("\"from\":\"alice\"");
        assertThat(toCarol).contains("\"isScreenSharing\":true");
    }

    @Test
    void secondParticipantClaim_whileAnotherIsSharing_isNotRelayedAsTrue() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        CollectingHandler hCarol = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);
        WebSocketSession carol = connect(mintToken("carol"), hCarol);

        joinRoomOfThree(alice, bob, carol, hBob, hCarol);

        // alice claims the sharer lock first
        alice.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"bob\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));
        alice.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"carol\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));
        assertThat(hBob.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\""), 3000)).isNotNull();
        assertThat(hCarol.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\""), 3000)).isNotNull();

        // bob tries to claim while alice already holds the lock
        bob.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"alice\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));
        bob.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"carol\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));

        String toAlice = hAlice.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\"")
                && f.contains("\"from\":\"bob\""), 2000);
        String toCarolFromBob = hCarol.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\"")
                && f.contains("\"from\":\"bob\""), 2000);

        // Either no relay is received at all, or the relay never claims isScreenSharing=true for bob.
        if (toAlice != null) {
            assertThat(toAlice).as("bob's rejected claim must never relay isScreenSharing=true")
                    .doesNotContain("\"isScreenSharing\":true");
        }
        if (toCarolFromBob != null) {
            assertThat(toCarolFromBob).as("bob's rejected claim must never relay isScreenSharing=true")
                    .doesNotContain("\"isScreenSharing\":true");
        }
    }

    @Test
    void afterSharerReleases_differentParticipantCanClaimTheLock() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        CollectingHandler hCarol = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);
        WebSocketSession carol = connect(mintToken("carol"), hCarol);

        joinRoomOfThree(alice, bob, carol, hBob, hCarol);

        // alice claims first
        alice.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"bob\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));
        alice.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"carol\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));
        assertThat(hBob.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\""), 3000)).isNotNull();
        assertThat(hCarol.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\""), 3000)).isNotNull();

        // alice releases
        alice.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"bob\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":false}"));
        alice.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"carol\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":false}"));
        assertThat(hBob.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\"")
                && f.contains("\"isScreenSharing\":false"), 3000)).isNotNull();
        assertThat(hCarol.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\"")
                && f.contains("\"isScreenSharing\":false"), 3000)).isNotNull();

        // bob claims now
        bob.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"carol\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));

        String toCarol = hCarol.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\"")
                && f.contains("\"from\":\"bob\""), 3000);
        assertThat(toCarol).as("carol should receive bob's successful claim after alice released").isNotNull();
        assertThat(toCarol).contains("\"isScreenSharing\":true");
    }

    @Test
    void sharerLeavingRoom_releasesTheLock() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        CollectingHandler hCarol = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);
        WebSocketSession carol = connect(mintToken("carol"), hCarol);

        String roomId = joinRoomOfThree(alice, bob, carol, hBob, hCarol);

        // alice claims sharer lock
        alice.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"carol\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));
        assertThat(hCarol.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\""), 3000)).isNotNull();

        // alice leaves the room
        alice.sendMessage(new TextMessage("{\"type\":\"leave-room\",\"roomId\":\"" + roomId + "\"}"));
        assertThat(hCarol.awaitMatching(f -> f.contains("\"type\":\"participant-left\""), 3000)).isNotNull();

        // bob claims after alice left
        bob.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"carol\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));

        String toCarol = hCarol.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\"")
                && f.contains("\"from\":\"bob\""), 3000);
        assertThat(toCarol).as("carol should receive bob's claim after alice's lock was released on leave")
                .isNotNull();
        assertThat(toCarol).contains("\"isScreenSharing\":true");
    }

    @Test
    void oneToOneCallMediaState_isUnaffectedByRoomGuard() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);

        // alice and bob are NOT in any room
        alice.sendMessage(new TextMessage(
                "{\"type\":\"media-state\",\"to\":\"bob\",\"micMuted\":false,\"camOff\":false,\"isScreenSharing\":true}"));

        String relay = hBob.awaitMatching(f -> f.contains("\"type\":\"media-state-relay\""), 3000);
        assertThat(relay).as("1-1 media-state relay should pass through unchanged").isNotNull();
        assertThat(relay).contains("\"from\":\"alice\"");
        assertThat(relay).contains("\"isScreenSharing\":true");
    }

    private static String jsonString(String json, String field) {
        assertThat(json).as("frame should not be null before extracting " + field).isNotNull();
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\"" + field + "\":\"([^\"]+)\"")
                .matcher(json);
        assertThat(matcher.find()).as("frame should contain string field " + field + ": " + json).isTrue();
        return matcher.group(1);
    }
}
