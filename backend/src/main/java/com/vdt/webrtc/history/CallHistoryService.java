package com.vdt.webrtc.history;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.vdt.webrtc.history.dto.HistoryPageResponse;
import com.vdt.webrtc.history.dto.HistoryRow;

@Service
public class CallHistoryService {
    private final CallHistoryRepository callHistoryRepository;

    public CallHistoryService(CallHistoryRepository callHistoryRepository) {
        this.callHistoryRepository = callHistoryRepository;
    }

    public HistoryPageResponse getHistory(String viewerId, String before, int size) {
        Instant beforeTs = (before == null || before.isBlank()) ? null : Instant.parse(before);

        Page<CallHistory> page = callHistoryRepository.findByViewer(viewerId, beforeTs, PageRequest.of(0, size));

        List<HistoryRow> items = page.getContent().stream()
                .map(h -> new HistoryRow(
                        h.getCallId(), h.getPeerId(), h.getDirection(), h.getEndReason(),
                        h.getDurationMs(), h.getStartedAt(), h.getEndedAt()))
                .toList();

        String nextCursor = page.hasNext() && !items.isEmpty()
                ? items.get(items.size() - 1).endedAt().toString()
                : null;

        return new HistoryPageResponse(items, nextCursor);
    }

}
