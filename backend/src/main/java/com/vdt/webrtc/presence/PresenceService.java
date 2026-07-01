package com.vdt.webrtc.presence;

import java.util.List;
import com.vdt.webrtc.ws.message.OnlineUser;

public interface PresenceService {
    void join(String userId);

    void heartbeat(String userId);

    void leave(String userId);

    List<OnlineUser> snapshot();

    /**
     * Publish a presence-events change without mutating join/leave state — used
     * when an external event (e.g. call ended) changes a user's derived
     * IN_CALL/ONLINE status.
     */
    void publishChanged();
}
