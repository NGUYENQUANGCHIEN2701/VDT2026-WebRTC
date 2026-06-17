package com.vdt.webrtc.presence;

import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.vdt.webrtc.ws.PresenceWebSocketHandler;
import lombok.extern.slf4j.Slf4j;


@Slf4j
@Component
public class PresenceSweeper {
    private static final long TTL_MS = 60_000;

    private final LocalPresenceService presence;
    private final PresenceWebSocketHandler handler;

    public PresenceSweeper(LocalPresenceService presence, PresenceWebSocketHandler handler) {
        this.presence = presence;
        this.handler = handler;
    }

    @Scheduled(fixedDelay = 15_000) // chạy lại mỗi 15s
    public void sweep() {
        long cutoff = System.currentTimeMillis() - TTL_MS;
        List<String> evicted = presence.evictStaleBefore(cutoff);

        if (!evicted.isEmpty()) {
            log.info("Đã quét offline: {}", evicted);
            handler.broadcastSnapshot();
        }
    }
}
