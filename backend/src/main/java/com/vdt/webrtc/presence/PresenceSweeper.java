package com.vdt.webrtc.presence;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class PresenceSweeper {

    private final StringRedisTemplate redisTemplate;

    public PresenceSweeper(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Scheduled(fixedDelay = 15_000) // chạy lại mỗi 15s
    public void sweep() {
        Set<String> members = redisTemplate.opsForSet().members("online-users");
        if (members == null || members.isEmpty()) {
            return;
        }
        // Loại bỏ các userId không còn online (không còn tồn tại trong Redis)
        List<String> evicted = new ArrayList<>();
        for (String userId : members) {
            if (Boolean.FALSE.equals(redisTemplate.hasKey("presence:" + userId))) {
                redisTemplate.opsForSet().remove("online-users", userId);
                evicted.add(userId);
            }
        }
        if (!evicted.isEmpty()) {
            log.info("Evicted users: {}", evicted);
            redisTemplate.convertAndSend("presence-events", "changed"); // Gửi thông báo đến các subscriber về sự thay
                                                                        // đổi trạng thái online
        }

    }
}
