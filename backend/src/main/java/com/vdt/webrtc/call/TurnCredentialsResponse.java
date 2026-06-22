package com.vdt.webrtc.call;

import java.util.List;

public record TurnCredentialsResponse(List<String> urls, String username, String credential) {
}