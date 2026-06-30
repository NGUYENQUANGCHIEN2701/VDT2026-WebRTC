package com.vdt.webrtc.ws.message;

import com.fasterxml.jackson.annotation.JsonTypeName;

import java.util.List;

@JsonTypeName("cancel-group-invite")
public record CancelGroupInvite(List<String> to) implements ClientMessage {
}
