package com.vdt.webrtc.presence;

import java.util.List;
import com.vdt.webrtc.ws.message.OnlineUser;

public interface PresenceService {
    void join(String userId);

    void heartbeat(String userId);

    void leave(String userId);

    List<OnlineUser> snapshot();
}
