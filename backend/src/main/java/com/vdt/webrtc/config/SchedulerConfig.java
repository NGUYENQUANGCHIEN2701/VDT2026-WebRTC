package com.vdt.webrtc.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration
public class SchedulerConfig {

    @Bean
    ThreadPoolTaskScheduler callTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(4); // vài luồng cho timer chạy song song
        scheduler.setThreadNamePrefix("call-timer-"); // tên thread dễ đọc khi debug
        return scheduler; // Spring tự gọi initialize() khi nó là bean
    }
}
