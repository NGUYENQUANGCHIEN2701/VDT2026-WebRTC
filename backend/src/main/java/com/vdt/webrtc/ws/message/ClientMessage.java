package com.vdt.webrtc.ws.message;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonIgnoreProperties(ignoreUnknown = true)
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = Ping.class, name = "ping"),
        @JsonSubTypes.Type(value = CallOffer.class, name = "call-offer")
})
public sealed interface ClientMessage permits Ping , CallOffer {

}
