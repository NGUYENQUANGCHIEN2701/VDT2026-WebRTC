package com.vdt.webrtc.call;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;

@Service
public class CallTimerService {

    private final TaskScheduler scheduler;
    private final ConcurrentHashMap<String, ScheduledFuture<?>> ringTimers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ScheduledFuture<?>> graceTimers = new ConcurrentHashMap<>();

    public CallTimerService(TaskScheduler scheduler) {
        this.scheduler = scheduler;
    }

    public void scheduleRingTimeout(String callId, Duration timeout, Runnable onTimeout) {
        ScheduledFuture<?> f = scheduler.schedule(() -> {
            ringTimers.remove(callId); // timer đã bắn → tự gỡ khỏi map
            onTimeout.run(); // chạy việc do CallService truyền vào (vd: transition→missed)
        }, Instant.now().plus(timeout));
        ringTimers.put(callId, f); // cất vé để có thể hủy
    }

    // hủy ring-timer. Lấy future ra khỏi ringTimers, nếu != null thì
    // cancel(false), trả boolean.
    public boolean cancelRingTimer(String callId) {
        ScheduledFuture<?> future = ringTimers.remove(callId);
        if (future != null) {
            future.cancel(false);
            return true;
        }
        return false;
    }

    // đặt grace-timer (giống scheduleRingTimeout nhưng dùng
    // graceTimers).
    public void scheduleGrace(String callId, Duration grace, Runnable onExpired) {
        ScheduledFuture<?> f = scheduler.schedule(() -> {
            graceTimers.remove(callId); // timer đã bắn → tự gỡ khỏi map
            onExpired.run(); // chạy việc do CallService truyền vào (vd: transition→missed)
        }, Instant.now().plus(grace));
        graceTimers.put(callId, f); // cất vé để có thể hủy
    }

    // hủy grace-timer (giống cancelRingTimer nhưng dùng
    // graceTimers).
    public boolean cancelGrace(String callId) {
        ScheduledFuture<?> future = graceTimers.remove(callId);
        if (future != null) {
            future.cancel(false);
            return true;
        }
        return false;
    }
}
