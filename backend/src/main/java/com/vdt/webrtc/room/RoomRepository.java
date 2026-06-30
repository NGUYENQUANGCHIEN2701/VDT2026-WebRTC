package com.vdt.webrtc.room;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Repository;

@Repository
public class RoomRepository {
    private static final String MAX_MEMBERS = "4";
    private static final String ROOM_TTL_SECONDS = "3600";

    private final StringRedisTemplate redis;
    private final RedisScript<Long> joinScript;
    private final RedisScript<Long> leaveScript;

    public RoomRepository(StringRedisTemplate redis) {
        this.redis = redis;
        this.joinScript = RedisScript.of(new ClassPathResource("scripts/join_room.lua"), Long.class);
        this.leaveScript = RedisScript.of(new ClassPathResource("scripts/leave_room.lua"), Long.class);
    }

    private String roomKey(String roomId) {
        return "room:" + roomId;
    }

    private String userRoomKey(String username) {
        return "user-room:" + username;
    }

    public RoomJoinResult join(String roomId, String username) {
        Long result = redis.execute(
                joinScript,
                List.of(roomKey(roomId), userRoomKey(username)),
                username,
                roomId,
                MAX_MEMBERS,
                ROOM_TTL_SECONDS);

        if (result == null) {
            throw new IllegalStateException("Redis join_room.lua returned null");
        }

        return switch (result.intValue()) {
            case 1 -> RoomJoinResult.OK;
            case -1 -> RoomJoinResult.FULL;
            case -2 -> RoomJoinResult.ALREADY_IN_OTHER_ROOM;
            default -> throw new IllegalStateException("Unexpected room join result: " + result);
        };
    }

    public boolean leave(String roomId, String username) {
        Long result = redis.execute(
                leaveScript,
                List.of(roomKey(roomId), userRoomKey(username)),
                username);

        if (result == null) {
            throw new IllegalStateException("Redis leave_room.lua returned null");
        }

        return result == 1L;
    }

    public String roomOf(String username) {
        return redis.opsForValue().get(userRoomKey(username));
    }

    public List<String> members(String roomId) {
        Set<String> members = redis.opsForSet().members(roomKey(roomId));
        if (members == null) {
            return List.of();
        }
        return new ArrayList<>(members);
    }

    public RoomSnapshot snapshot(String roomId) {
        return new RoomSnapshot(roomId, members(roomId));
    }

}
