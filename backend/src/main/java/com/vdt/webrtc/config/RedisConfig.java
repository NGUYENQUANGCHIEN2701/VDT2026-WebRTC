package com.vdt.webrtc.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

import com.vdt.webrtc.ws.PresenceEventListener;
import com.vdt.webrtc.ws.RoutingMessageListener;

@Configuration
public class RedisConfig {
    @Value("${app.instance-id:${HOSTNAME:unknown}}")
    private String instanceId;

    @Bean
    ChannelTopic instanceChannel() {
        return new ChannelTopic("inst:" + instanceId);
    }

    @Bean
    ChannelTopic presenceChannel() {
        return new ChannelTopic("presence-events");
    }

    @Bean
    RedisMessageListenerContainer redisListenerContainer(
            RedisConnectionFactory cf,
            RoutingMessageListener routing,
            PresenceEventListener presenceListener) {
        var c = new RedisMessageListenerContainer();
        c.setConnectionFactory(cf);
        c.addMessageListener(routing, instanceChannel());          // dây 1
        c.addMessageListener(presenceListener, presenceChannel()); // dây 2
        return c;
    }
}
