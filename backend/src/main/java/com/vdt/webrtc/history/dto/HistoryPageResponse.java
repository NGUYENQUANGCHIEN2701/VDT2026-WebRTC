package com.vdt.webrtc.history.dto;

import java.util.List;

public record HistoryPageResponse(List<HistoryRow> items, String nextCursor) {
}
