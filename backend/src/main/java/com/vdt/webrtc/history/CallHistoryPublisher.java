package com.vdt.webrtc.history;

import org.springframework.amqp.core.AmqpTemplate;
import org.springframework.stereotype.Service;

import com.vdt.webrtc.config.RabbitMqConfig;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class CallHistoryPublisher {
    private final AmqpTemplate amqpTemplate;

    public CallHistoryPublisher(AmqpTemplate amqpTemplate) {
        this.amqpTemplate = amqpTemplate;
    }

    public void publish(CallHistoryEvent event) {
        try {
            amqpTemplate.convertAndSend(
                    RabbitMqConfig.CALL_HISTORY_EXCHANGE,
                    RabbitMqConfig.ROUTING_KEY,
                    event);
        } catch (Exception e) {
            // NUỐT lỗi — pipeline lịch sử KHÔNG được phép kéo theo luồng realtime
            log.error("Không publish được call-history event cho callId={}: {}",
                    event.callId(), e.getMessage());
        }
    }

}
