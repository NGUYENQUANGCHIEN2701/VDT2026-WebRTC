package com.vdt.webrtc.metrics;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.micrometer.metrics.autoconfigure.MeterRegistryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.core.instrument.MeterRegistry;

@Configuration
public class MetricsConfig {

    @Value("${app.instance-id}")
    private String instanceId;

    // Gắn tag "instance" cho MỌI meter (kể cả các meter auto-config của Boot,
    // vd http_server_requests) — để Grafana phân biệt được backend-1 vs backend-2.
    @Bean
    MeterRegistryCustomizer<MeterRegistry> commonTags() {
        return registry -> registry.config().commonTags("instance", instanceId);
    }
}
