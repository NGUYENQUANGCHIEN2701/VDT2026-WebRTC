package com.vdt.webrtc.presence;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;


import com.vdt.webrtc.ws.message.OnlineUser;

public class LocalPresenceService implements PresenceService {
    private final Map<String, Long> lastSeen = new ConcurrentHashMap<>();

    @Override
    public void join(String userId) {
        lastSeen.put(userId, System.currentTimeMillis());
    }

    @Override
    public void heartbeat(String userId) {
        lastSeen.put(userId, System.currentTimeMillis());
    }

    @Override
    public void leave(String userId) {
        lastSeen.remove(userId);
    }

    @Override
    public void publishChanged() {
        // no-op: LocalPresenceService không có pub/sub broadcast (single-instance),
        // giống hệt join()/leave() ở trên cũng không broadcast.
    }

    @Override
    public List<OnlineUser> snapshot() {
        return lastSeen.keySet().stream()
                .map(userId -> new OnlineUser(userId, PresenceStatus.ONLINE))
                .toList();
    }

    public List<String> evictStaleBefore(long cutoff) {
        List<String> evicted = new ArrayList<>();
        for (var entry : lastSeen.entrySet()) {
            if (entry.getValue() < cutoff && lastSeen.remove(entry.getKey(), entry.getValue())) {
                evicted.add(entry.getKey());
            }
        }
        return evicted;
    }

}
