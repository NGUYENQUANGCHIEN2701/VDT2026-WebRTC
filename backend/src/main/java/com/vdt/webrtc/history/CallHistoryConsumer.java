package com.vdt.webrtc.history;

import java.util.List;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

import com.vdt.webrtc.config.RabbitMqConfig;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class CallHistoryConsumer {
    private final CallHistoryRepository repo;

    public CallHistoryConsumer(CallHistoryRepository repo) {
        this.repo = repo;
    }

    @RabbitListener(queues = RabbitMqConfig.CALL_HISTORY_QUEUE)
    public void consume(CallHistoryEvent event) {
        Long durationMs = computeDuration(event);
        CallHistory callerRow = CallHistory.builder()
                .callId(event.callId())
                .viewerId(event.callerId()) // chủ dòng = người gọi
                .peerId(event.calleeId()) // đối phương = người nhận
                .direction("OUTGOING") // người gọi luôn là "gọi đi"
                .endReason(event.endReason())
                .durationMs(durationMs)
                .startedAt(event.startedAt())
                .endedAt(event.endedAt())
                .build();

        CallHistory calleeRow = CallHistory.builder()
                .callId(event.callId())
                .viewerId(event.calleeId()) // chủ dòng = người nhận
                .peerId(event.callerId())
                .direction(calleeDirection(event.endReason()))
                .endReason(event.endReason())
                .durationMs(durationMs)
                .startedAt(event.startedAt())
                .endedAt(event.endedAt())
                .build();
        try {
            repo.saveAll(List.of(callerRow, calleeRow));
        } catch (DataIntegrityViolationException e) {
            // Giao trùng (at-least-once) → 2 dòng đã tồn tại → bỏ qua, coi như xử lý xong
            log.info("Event trùng cho callId={}, bỏ qua (idempotent)", event.callId());
        }
    }

    /**
     * Góc nhìn của người NHẬN: chỉ "nhỡ" mới là MISSED, còn lại đều là INCOMING.
     */
    private static String calleeDirection(String endReason) {
        return "missed".equals(endReason) ? "MISSED" : "INCOMING";
    }

    /** Chỉ cuộc completed (đã từng active) mới có thời lượng thật; còn lại null. */
    private static Long computeDuration(CallHistoryEvent event) {
        if ("completed".equals(event.endReason()) && event.startedAt() != null) {
            return event.endedAt().toEpochMilli() - event.startedAt().toEpochMilli();
        }
        return null;
    }

}
