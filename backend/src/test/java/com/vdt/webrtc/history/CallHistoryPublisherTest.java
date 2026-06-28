package com.vdt.webrtc.history;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.core.AmqpTemplate;

import com.vdt.webrtc.config.RabbitMqConfig;

@ExtendWith(MockitoExtension.class)
class CallHistoryPublisherTest {

    @Mock
    AmqpTemplate amqpTemplate; // "đồ giả" thay cho RabbitTemplate thật

    @InjectMocks
    CallHistoryPublisher publisher; // Mockito tự nhét mock ở trên vào constructor

    // gửi đúng exchange + routing key + event
    @Test
    void publish_forwardsToAmqpTemplate() {
        CallHistoryEvent e = new CallHistoryEvent("c1", "alice", "bob", "completed", null, Instant.now());

        publisher.publish(e);

        verify(amqpTemplate).convertAndSend(
                RabbitMqConfig.CALL_HISTORY_EXCHANGE, RabbitMqConfig.ROUTING_KEY, e);
    }

    // RabbitMQ chết → publish() KHÔNG được ném exception ra ngoài (fire-and-forget)
    @Test
    void publish_swallowsException_neverThrows() {
        doThrow(new AmqpException("broker down"))
                .when(amqpTemplate).convertAndSend(anyString(), anyString(), any(Object.class));
        CallHistoryEvent e = new CallHistoryEvent("c2", "alice", "bob", "missed", null, Instant.now());

        assertThatCode(() -> publisher.publish(e)).doesNotThrowAnyException();
    }

    // publisher là cái loa chung — gửi với MỌI end-reason, không tự lọc
    @Test
    void publish_forwardsRegardlessOfEndReason() {
        for (String reason : List.of("completed", "missed", "rejected", "cancelled", "dropped")) {
            publisher.publish(new CallHistoryEvent("c-" + reason, "a", "b", reason, null, Instant.now()));
        }
        verify(amqpTemplate, times(5)).convertAndSend(anyString(), anyString(), any(Object.class));
    }
}
