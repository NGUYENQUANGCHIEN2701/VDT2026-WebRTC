package com.vdt.webrtc.ws.message;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = PresenceSnapshot.class, name = "presence"),
    @JsonSubTypes.Type(value = SessionSuperseded.class, name = "session-superseded"),
    @JsonSubTypes.Type(value = Pong.class, name = "pong"),
    @JsonSubTypes.Type(value = CallOfferReceived.class, name = "call-offer-received")
})
public sealed interface ServerMessage permits PresenceSnapshot, SessionSuperseded, Pong , CallOfferReceived {
    
}
