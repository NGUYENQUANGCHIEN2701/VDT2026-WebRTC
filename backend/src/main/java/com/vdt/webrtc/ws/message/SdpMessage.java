package com.vdt.webrtc.ws.message;

import tools.jackson.databind.JsonNode;

public record SdpMessage(String to, String callId, JsonNode sdp) implements ClientMessage {
    
}
