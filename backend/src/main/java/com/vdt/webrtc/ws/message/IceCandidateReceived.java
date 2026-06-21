package com.vdt.webrtc.ws.message;

import tools.jackson.databind.JsonNode;

public record IceCandidateReceived(String from, String callId, JsonNode candidate) implements ServerMessage {
    
}
