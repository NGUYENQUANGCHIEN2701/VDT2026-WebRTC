package com.vdt.webrtc.ws.message;

import tools.jackson.databind.JsonNode;

public record IceCandidateMessage(String to, String callId, JsonNode candidate) implements ClientMessage {
    
}
