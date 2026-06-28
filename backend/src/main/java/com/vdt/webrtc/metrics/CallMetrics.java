package com.vdt.webrtc.metrics;

import java.util.concurrent.atomic.AtomicLong;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class CallMetrics {
    private final AtomicLong startedToday = new AtomicLong();
    private final AtomicLong completedToday = new AtomicLong();
    private final AtomicLong missedToday = new AtomicLong();

    public void incrementStarted() {
        startedToday.incrementAndGet();
    }

    public void incrementCompleted() {
        completedToday.incrementAndGet();
    }

    public void incrementMissed() {
        missedToday.incrementAndGet();
    }

    public long getStarted() {
        return startedToday.get();
    }

    public long getCompleted() {
        return completedToday.get();
    }

    public long getMissed() {
        return missedToday.get();
    }

    @Scheduled(cron = "0 0 0 * * *") // 00:00 mỗi ngày (giờ server) — D-14
    public void resetDaily() {
        startedToday.set(0);
        completedToday.set(0);
        missedToday.set(0);
        log.info("Daily call metrics reset");
    }
}
