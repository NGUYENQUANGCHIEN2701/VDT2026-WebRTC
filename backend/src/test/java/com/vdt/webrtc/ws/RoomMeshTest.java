package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

class RoomMeshTest extends WsTestSupport {

    @Autowired
    StringRedisTemplate redis;

    @BeforeEach
    void flushRedis() {
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    @Test
    void groupInvite_joinRoom_returnsExistingMemberListToJoiner_andNotifiesExistingMembers() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);

        alice.sendMessage(new TextMessage("{\"type\":\"group-invite\",\"to\":[\"bob\"]}"));
        String invite = hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-invite\""), 3000);
        assertThat(invite).as("bob should receive a server-generated room invite").isNotNull();
        String roomId = jsonString(invite, "roomId");

        bob.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));

        String joined = hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-joined\""), 3000);
        assertThat(joined).contains("\"roomId\":\"" + roomId + "\"");
        assertThat(joined).contains("alice");
        assertThat(hAlice.awaitMatching(frame -> frame.contains("\"type\":\"participant-joined\"")
                && frame.contains("\"username\":\"bob\""), 3000)).isNotNull();
    }

    @Test
    void declineRoomInvite_notifiesExistingRoomMembers() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);

        alice.sendMessage(new TextMessage("{\"type\":\"group-invite\",\"to\":[\"bob\"]}"));
        String roomId = jsonString(hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-invite\""), 3000),
                "roomId");

        bob.sendMessage(new TextMessage("{\"type\":\"decline-room-invite\",\"roomId\":\"" + roomId + "\"}"));

        String declined = hAlice.awaitMatching(frame -> frame.contains("\"type\":\"room-invite-declined\"")
                && frame.contains("\"username\":\"bob\""), 3000);
        assertThat(declined).as("inviter should see invitees reject the room invitation").isNotNull();
        assertThat(declined).contains("\"roomId\":\"" + roomId + "\"");
    }

    @Test
    void joinRoom_rejectsFifthParticipantWithRoomFullMessage() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        CollectingHandler hCarol = new CollectingHandler();
        CollectingHandler hDave = new CollectingHandler();
        CollectingHandler hErin = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), new CollectingHandler());
        WebSocketSession bob = connect(mintToken("bob"), hBob);
        WebSocketSession carol = connect(mintToken("carol"), hCarol);
        WebSocketSession dave = connect(mintToken("dave"), hDave);
        WebSocketSession erin = connect(mintToken("erin"), hErin);

        alice.sendMessage(new TextMessage("{\"type\":\"group-invite\",\"to\":[\"bob\",\"carol\",\"dave\"]}"));
        String roomId = jsonString(hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-invite\""), 3000),
                "roomId");

        bob.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));
        assertThat(hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-joined\""), 3000)).isNotNull();
        carol.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));
        assertThat(hCarol.awaitMatching(frame -> frame.contains("\"type\":\"room-joined\""), 3000)).isNotNull();
        dave.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));
        assertThat(hDave.awaitMatching(frame -> frame.contains("\"type\":\"room-joined\""), 3000)).isNotNull();
        erin.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));

        String full = hErin.awaitMatching(frame -> frame.contains("\"type\":\"room-full\""), 3000);
        assertThat(full).as("5th participant should be rejected by the server").isNotNull();
        assertThat(full).contains("\"roomId\":\"" + roomId + "\"");
    }

    @Test
    void leaveRoom_broadcastsParticipantLeft_withoutEndingRemainingRoom() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        CollectingHandler hCarol = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), hAlice);
        WebSocketSession bob = connect(mintToken("bob"), hBob);
        WebSocketSession carol = connect(mintToken("carol"), hCarol);

        alice.sendMessage(new TextMessage("{\"type\":\"group-invite\",\"to\":[\"bob\",\"carol\"]}"));
        String roomId = jsonString(hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-invite\""), 3000),
                "roomId");
        bob.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));
        assertThat(hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-joined\""), 3000)).isNotNull();
        carol.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));
        assertThat(hCarol.awaitMatching(frame -> frame.contains("\"type\":\"room-joined\""), 3000)).isNotNull();

        bob.sendMessage(new TextMessage("{\"type\":\"leave-room\",\"roomId\":\"" + roomId + "\"}"));

        String left = hCarol.awaitMatching(frame -> frame.contains("\"type\":\"participant-left\"")
                && frame.contains("\"username\":\"bob\""), 3000);
        assertThat(left).as("remaining participants should see only bob leave").isNotNull();
        assertThat(hCarol.drainMatching(frame -> frame.contains("\"type\":\"room-ended\""))).isFalse();
    }

    @Test
    void existingOneToOneInviteStillRoutesThroughSameHandler() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(mintToken("alice"), new CollectingHandler());
        connect(mintToken("bob"), hBob);

        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));

        String ring = hBob.awaitMatching(
                frame -> frame.contains("call-state-changed") && frame.contains("\"state\":\"ringing\""), 3000);
        assertThat(ring).as("Phase 7 room messages must not break the protected 1-1 path").isNotNull();
        assertThat(ring).contains("\"callerId\":\"alice\"");
    }

    private static String jsonString(String json, String field) {
        assertThat(json).as("frame should not be null before extracting " + field).isNotNull();
        Matcher matcher = Pattern.compile("\"" + field + "\":\"([^\"]+)\"").matcher(json);
        assertThat(matcher.find()).as("frame should contain string field " + field + ": " + json).isTrue();
        return matcher.group(1);
    }
}
