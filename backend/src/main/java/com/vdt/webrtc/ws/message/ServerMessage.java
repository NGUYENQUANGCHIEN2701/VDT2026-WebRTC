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
        @JsonSubTypes.Type(value = HangUpReceived.class, name = "hang-up-received"),
        @JsonSubTypes.Type(value = SdpReceived.class, name = "sdp-received"),
        @JsonSubTypes.Type(value = IceCandidateReceived.class, name = "ice-candidate-received"),
        @JsonSubTypes.Type(value = CallStateChanged.class, name = "call-state-changed"),
        @JsonSubTypes.Type(value = MediaStateRelay.class, name = "media-state-relay"),
        @JsonSubTypes.Type(value = RoomFull.class, name = "room-full"),
        @JsonSubTypes.Type(value = ParticipantJoined.class, name = "participant-joined"),
        @JsonSubTypes.Type(value = ParticipantLeft.class, name = "participant-left"),
        @JsonSubTypes.Type(value = RoomInvite.class, name = "room-invite"),
        @JsonSubTypes.Type(value = RoomJoined.class, name = "room-joined")
})
public sealed interface ServerMessage permits PresenceSnapshot, SessionSuperseded, Pong, CallOfferReceived,
        CallAcceptReceived, CallRejectReceived, CallCancelReceived, HangUpReceived, SdpReceived,
        IceCandidateReceived, CallStateChanged, MediaStateRelay, RoomFull, ParticipantJoined, ParticipantLeft,
        RoomInvite, RoomJoined {

}
