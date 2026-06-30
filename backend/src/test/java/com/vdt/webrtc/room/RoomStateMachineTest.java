package com.vdt.webrtc.room;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import com.vdt.webrtc.TestcontainersConfiguration;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class RoomStateMachineTest {

    private static final String MAX_MEMBERS = "4";
    private static final String ROOM_TTL_SECONDS = "3600";

    @Autowired
    StringRedisTemplate redis;

    RedisScript<Long> joinScript;
    RedisScript<Long> leaveScript;

    @BeforeEach
    void clean() {
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();
        joinScript = RedisScript.of(new ClassPathResource("scripts/join_room.lua"), Long.class);
        leaveScript = RedisScript.of(new ClassPathResource("scripts/leave_room.lua"), Long.class);
    }

    @Test
    void joinRoom_addsUserWhileBelowCap_andStoresReverseIndex() {
        Long result = join("room-a", "alice");

        assertThat(result).isEqualTo(1L);
        assertThat(redis.opsForSet().members("room:room-a")).containsExactly("alice");
        assertThat(redis.opsForValue().get("user-room:alice")).isEqualTo("room-a");
        assertThat(redis.getExpire("room:room-a")).isPositive();
    }

    
    @Test
    void joinRoom_returnsFullForFifthUniqueParticipant() {
        join("room-a", "alice");
        join("room-a", "bob");
        join("room-a", "carol");
        join("room-a", "dave");

        Long result = join("room-a", "erin");

        assertThat(result).isEqualTo(-1L);
        assertThat(redis.opsForSet().members("room:room-a"))
                .containsExactlyInAnyOrder("alice", "bob", "carol", "dave");
        assertThat(redis.opsForValue().get("user-room:erin")).isNull();
    }

    @Test
    void joinRoom_repeatedJoinBySameUser_isIdempotent() {
        assertThat(join("room-a", "alice")).isEqualTo(1L);

        Long repeated = join("room-a", "alice");

        assertThat(repeated).isEqualTo(1L);
        assertThat(redis.opsForSet().size("room:room-a")).isEqualTo(1L);
        assertThat(redis.opsForValue().get("user-room:alice")).isEqualTo("room-a");
    }

    @Test
    void joinRoom_concurrentJoinsAtSizeThree_allowExactlyOneWinner() throws InterruptedException {
        join("room-a", "alice");
        join("room-a", "bob");
        join("room-a", "carol");

        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        AtomicInteger winners = new AtomicInteger();

        for (String username : List.of("dave", "erin")) {
            new Thread(() -> {
                try {
                    start.await();
                    if (join("room-a", username) == 1L) {
                        winners.incrementAndGet();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            }).start();
        }

        start.countDown();
        done.await();

        assertThat(winners.get()).isEqualTo(1);
        assertThat(redis.opsForSet().size("room:room-a")).isEqualTo(4L);
    }

    @Test
    void leaveRoom_removingLastParticipantDeletesRoomAndReverseIndex() {
        join("room-a", "alice");

        Long result = leave("room-a", "alice");

        assertThat(result).isEqualTo(1L);
        assertThat(redis.hasKey("room:room-a")).isFalse();
        assertThat(redis.hasKey("user-room:alice")).isFalse();
        assertNoRoomOrUserRoomKeys();
    }

    @Test
    void leaveRoom_removingOneParticipantKeepsRemainingMembers() {
        join("room-a", "alice");
        join("room-a", "bob");

        Long result = leave("room-a", "alice");

        assertThat(result).isEqualTo(1L);
        assertThat(redis.opsForSet().members("room:room-a")).containsExactly("bob");
        assertThat(redis.hasKey("user-room:alice")).isFalse();
        assertThat(redis.opsForValue().get("user-room:bob")).isEqualTo("room-a");
    }

    @Test
    void leaveRoom_forMissingUserIsSafeAndDoesNotDeleteOtherMembers() {
        join("room-a", "alice");

        Long result = leave("room-a", "bob");

        assertThat(result).isEqualTo(0L);
        assertThat(redis.opsForSet().members("room:room-a")).containsExactly("alice");
        assertThat(redis.opsForValue().get("user-room:alice")).isEqualTo("room-a");
    }

    private Long join(String roomId, String username) {
        return redis.execute(joinScript,
                List.of("room:" + roomId, "user-room:" + username),
                username, roomId, MAX_MEMBERS, ROOM_TTL_SECONDS);
    }

    private Long leave(String roomId, String username) {
        return redis.execute(leaveScript,
                List.of("room:" + roomId, "user-room:" + username),
                username);
    }

    private void assertNoRoomOrUserRoomKeys() {
        Set<String> roomKeys = redis.keys("room:*");
        Set<String> userRoomKeys = redis.keys("user-room:*");
        assertThat(roomKeys).isEmpty();
        assertThat(userRoomKeys).isEmpty();
    }
}
