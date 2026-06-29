package com.vdt.webrtc.ws;

import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

@Component
public class PresenceEventListener implements MessageListener {
    private final PresenceWebSocketHandler presenceWebSocketHandler;

    public PresenceEventListener(PresenceWebSocketHandler presenceWebSocketHandler) {
        this.presenceWebSocketHandler = presenceWebSocketHandler;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        presenceWebSocketHandler.broadcastSnapshot();
    }

}
