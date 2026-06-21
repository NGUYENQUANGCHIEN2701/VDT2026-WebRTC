package com.vdt.webrtc.ws.message;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = PresenceSnapshot.class, name = "presence"),
        @JsonSubTypes.Type(value = SessionSuperseded.class, name = "session-superseded"),
        @JsonSubTypes.Type(value = Pong.class, name = "pong"),
        @JsonSubTypes.Type(value = CallOfferReceived.class, name = "call-offer-received"),
        @JsonSubTypes.Type(value = CallAcceptReceived.class, name = "call-accept-received"),
        @JsonSubTypes.Type(value = CallRejectReceived.class, name = "call-reject-received"),
        @JsonSubTypes.Type(value = CallCancelReceived.class, name = "call-cancel-received"),
        @JsonSubTypes.Type(value = HangUpReceived.class, name = "hang-up-received")
})
public sealed interface ServerMessage permits PresenceSnapshot, SessionSuperseded, Pong, CallOfferReceived,
        CallAcceptReceived, CallRejectReceived, CallCancelReceived, HangUpReceived {

}
