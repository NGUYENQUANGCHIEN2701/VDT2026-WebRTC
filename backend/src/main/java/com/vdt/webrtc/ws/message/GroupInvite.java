package com.vdt.webrtc.ws.message;

import java.util.List;

public record GroupInvite(List<String> to) implements ClientMessage {
}
