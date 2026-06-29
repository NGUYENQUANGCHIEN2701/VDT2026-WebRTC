package com.vdt.webrtc.presence;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.vdt.webrtc.ws.message.OnlineUser;

@Primary
@Service
public class RedisPresenceService implements PresenceService {

    private final StringRedisTemplate redisTemplate;
    private final long PRESENCE_TTL_SECONDS = 60;

    public RedisPresenceService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public void join(String userId) {
        redisTemplate.opsForValue().set("presence:" + userId, "online", Duration.ofSeconds(PRESENCE_TTL_SECONDS));
        redisTemplate.opsForSet().add("online-users", userId);
        redisTemplate.convertAndSend("presence-events", "changed");
    }

    @Override
    public void heartbeat(String userId) {
        if (Boolean.TRUE.equals(redisTemplate.hasKey("presence:" + userId))) {
            redisTemplate.expire("presence:" + userId, Duration.ofSeconds(PRESENCE_TTL_SECONDS));
        }
    }

    @Override
    public void leave(String userId) {
        redisTemplate.delete("presence:" + userId);
        redisTemplate.opsForSet().remove("online-users", userId);
        redisTemplate.convertAndSend("presence-events", "changed");
    }

    @Override
    public List<OnlineUser> snapshot() {
        Set<String> members = redisTemplate.opsForSet().members("online-users");
        if (members == null || members.isEmpty()) {
            return List.of();
        }

        return members.stream()
                .map(userId -> {
                    boolean inCall = Boolean.TRUE.equals(redisTemplate.hasKey("user-call:" + userId));
                    return new OnlineUser(userId, inCall ? PresenceStatus.IN_CALL : PresenceStatus.ONLINE);
                })
                .toList();

    }

}
