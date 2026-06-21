package com.vdt.webrtc.ws.message;

import tools.jackson.databind.JsonNode;

public record SdpReceived(String from, String callId, JsonNode sdp) implements ServerMessage {
    
}
