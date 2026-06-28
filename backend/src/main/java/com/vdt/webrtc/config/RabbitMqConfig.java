package com.vdt.webrtc.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;
@Configuration
public class RabbitMqConfig {
    public static final String CALL_HISTORY_EXCHANGE = "call.history";
    public static final String CALL_HISTORY_QUEUE = "call-history-q";
    public static final String CALL_HISTORY_DLX = "call-history-dlx";
    public static final String CALL_HISTORY_DLQ = "call-history-dlq";
    public static final String ROUTING_KEY = "call.ended";

    // --- Exchange chính + exchange chết (DLX) ---
    @Bean
    DirectExchange callHistoryExchange() {
        return new DirectExchange(CALL_HISTORY_EXCHANGE);
    }

    @Bean
    DirectExchange callHistoryDlx() {
        return new DirectExchange(CALL_HISTORY_DLX);
    }

    // --- Queue chính: lỗi hết retry -> đẩy sang DLX/DLQ ---
    @Bean
    Queue callHistoryQueue() {
        return QueueBuilder.durable(CALL_HISTORY_QUEUE)
                .withArgument("x-dead-letter-exchange", CALL_HISTORY_DLX)
                .withArgument("x-dead-letter-routing-key", ROUTING_KEY)
                .build();
    }

    @Bean
    Queue callHistoryDlq() {
        return QueueBuilder.durable(CALL_HISTORY_DLQ).build();
    }

    // --- Bind queue vào exchange theo routing key ---
    @Bean
    Binding callHistoryBinding() {
        return BindingBuilder.bind(callHistoryQueue())
                .to(callHistoryExchange())
                .with(ROUTING_KEY);
    }

    @Bean
    Binding callHistoryDlqBinding() {
        return BindingBuilder.bind(callHistoryDlq())
                .to(callHistoryDlx())
                .with(ROUTING_KEY);
    }

    // --- converter JSON ---
    @Bean
    JacksonJsonMessageConverter jsonMessageConverter(JsonMapper jsonMapper) {
        return new JacksonJsonMessageConverter(jsonMapper);
    }

}
