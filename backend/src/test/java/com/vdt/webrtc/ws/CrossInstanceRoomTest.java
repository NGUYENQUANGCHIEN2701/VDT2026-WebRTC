package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;

import com.vdt.webrtc.WebrtcApplication;
import com.vdt.webrtc.config.JwtService;

class CrossInstanceRoomTest {

    static GenericContainer<?> redis;
    static PostgreSQLContainer<?> postgres;
    static RabbitMQContainer rabbitmq;

    static ConfigurableApplicationContext ctx1;
    static ConfigurableApplicationContext ctx2;
    static int port1;
    static int port2;

    private final StandardWebSocketClient client = new StandardWebSocketClient();
    private final List<WebSocketSession> opened = new CopyOnWriteArrayList<>();

    @BeforeAll
    static void startAll() {
        redis = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
        postgres = new PostgreSQLContainer<>("postgres:17-alpine");
        rabbitmq = new RabbitMQContainer("rabbitmq:4.1-management");
        redis.start();
        postgres.start();
        rabbitmq.start();

        ctx1 = bootInstance("room-inst1");
        ctx2 = bootInstance("room-inst2");
        port1 = serverPort(ctx1);
        port2 = serverPort(ctx2);
    }

    private static ConfigurableApplicationContext bootInstance(String instanceId) {
        return new SpringApplicationBuilder(WebrtcApplication.class)
                .run(
                        "--server.port=0",
                        "--app.instance-id=" + instanceId,
                        "--call.ring-timeout-seconds=5",
                        "--spring.data.redis.host=" + redis.getHost(),
                        "--spring.data.redis.port=" + redis.getMappedPort(6379),
                        "--spring.datasource.url=" + postgres.getJdbcUrl(),
                        "--spring.datasource.username=" + postgres.getUsername(),
                        "--spring.datasource.password=" + postgres.getPassword(),
                        "--spring.rabbitmq.host=" + rabbitmq.getHost(),
                        "--spring.rabbitmq.port=" + rabbitmq.getAmqpPort(),
                        "--spring.rabbitmq.username=" + rabbitmq.getAdminUsername(),
                        "--spring.rabbitmq.password=" + rabbitmq.getAdminPassword());
    }

    private static int serverPort(ConfigurableApplicationContext ctx) {
        return Integer.parseInt(ctx.getEnvironment().getProperty("local.server.port"));
    }

    @BeforeEach
    void flushRedis() {
        ctx1.getBean(StringRedisTemplate.class)
                .getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    @AfterEach
    void closeSessions() {
        for (WebSocketSession session : opened) {
            try {
                if (session.isOpen()) {
                    session.close();
                }
            } catch (Exception ignored) {
                // best effort cleanup
            }
        }
        opened.clear();
    }

    @AfterAll
    static void stopAll() {
        if (ctx1 != null) {
            ctx1.close();
        }
        if (ctx2 != null) {
            ctx2.close();
        }
        if (rabbitmq != null) {
            rabbitmq.stop();
        }
        if (postgres != null) {
            postgres.stop();
        }
        if (redis != null) {
            redis.stop();
        }
    }

    @Test
    void crossInstance_joinerReceivesRoomFanoutInitiatedOnOtherInstance() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(port1, mint("alice"), hAlice);
        WebSocketSession bob = connect(port2, mint("bob"), hBob);
        awaitRouteRegistered("bob");

        alice.sendMessage(new TextMessage("{\"type\":\"group-invite\",\"to\":[\"bob\"]}"));
        String roomId = jsonString(hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-invite\""), 10000),
                "roomId");

        bob.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));

        assertThat(hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-joined\"")
                && frame.contains("alice"), 10000)).isNotNull();
        assertThat(hAlice.awaitMatching(frame -> frame.contains("\"type\":\"participant-joined\"")
                && frame.contains("\"username\":\"bob\""), 10000)).isNotNull();
    }

    @Test
    void crossInstance_participantLeftFanoutReachesRemainingPeers() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        CollectingHandler hCarol = new CollectingHandler();
        WebSocketSession alice = connect(port1, mint("alice"), new CollectingHandler());
        WebSocketSession bob = connect(port2, mint("bob"), hBob);
        WebSocketSession carol = connect(port1, mint("carol"), hCarol);
        awaitRouteRegistered("bob");
        awaitRouteRegistered("carol");

        alice.sendMessage(new TextMessage("{\"type\":\"group-invite\",\"to\":[\"bob\",\"carol\"]}"));
        String roomId = jsonString(hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-invite\""), 10000),
                "roomId");
        bob.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));
        carol.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));

        bob.sendMessage(new TextMessage("{\"type\":\"leave-room\",\"roomId\":\"" + roomId + "\"}"));

        assertThat(hCarol.awaitMatching(frame -> frame.contains("\"type\":\"participant-left\"")
                && frame.contains("\"username\":\"bob\""), 10000)).isNotNull();
    }

    @Test
    void crossInstance_competingFifthJoinStillHasSingleRoomFullLoser() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        CollectingHandler hDave = new CollectingHandler();
        CollectingHandler hErin = new CollectingHandler();
        WebSocketSession alice = connect(port1, mint("alice"), new CollectingHandler());
        WebSocketSession bob = connect(port2, mint("bob"), hBob);
        WebSocketSession carol = connect(port1, mint("carol"), new CollectingHandler());
        WebSocketSession dave = connect(port2, mint("dave"), hDave);
        WebSocketSession erin = connect(port1, mint("erin"), hErin);
        awaitRouteRegistered("bob");
        awaitRouteRegistered("dave");
        awaitRouteRegistered("erin");

        alice.sendMessage(new TextMessage("{\"type\":\"group-invite\",\"to\":[\"bob\",\"carol\",\"dave\",\"erin\"]}"));
        String roomId = jsonString(hBob.awaitMatching(frame -> frame.contains("\"type\":\"room-invite\""), 10000),
                "roomId");
        bob.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));
        carol.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));

        dave.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));
        erin.sendMessage(new TextMessage("{\"type\":\"join-room\",\"roomId\":\"" + roomId + "\"}"));

        boolean daveFull = hDave.awaitMatching(frame -> frame.contains("\"type\":\"room-full\""), 10000) != null;
        boolean erinFull = hErin.awaitMatching(frame -> frame.contains("\"type\":\"room-full\""), 10000) != null;
        assertThat(daveFull ^ erinFull).as("exactly one of the competing 5th joins should lose").isTrue();
    }

    private WebSocketSession connect(int port, String token, CollectingHandler handler) throws Exception {
        WebSocketSession session = client.execute(handler, "ws://localhost:" + port + "/ws?token=" + token)
                .get(5, TimeUnit.SECONDS);
        opened.add(session);
        return session;
    }

    private String mint(String username) {
        return ctx1.getBean(JwtService.class).generateToken(username, "USER");
    }

    private void awaitRouteRegistered(String username) {
        StringRedisTemplate redisTemplate = ctx1.getBean(StringRedisTemplate.class);
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            if (Boolean.TRUE.equals(redisTemplate.hasKey("route:" + username))) {
                return;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private static String jsonString(String json, String field) {
        assertThat(json).as("frame should not be null before extracting " + field).isNotNull();
        Matcher matcher = Pattern.compile("\"" + field + "\":\"([^\"]+)\"").matcher(json);
        assertThat(matcher.find()).as("frame should contain string field " + field + ": " + json).isTrue();
        return matcher.group(1);
    }

    protected static class CollectingHandler extends TextWebSocketHandler {
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            messages.add(message.getPayload());
        }

        public String awaitMatching(Predicate<String> predicate, long timeoutMs) throws InterruptedException {
            long deadline = System.currentTimeMillis() + timeoutMs;
            String frame;
            while ((frame = messages.poll(Math.max(0, deadline - System.currentTimeMillis()),
                    TimeUnit.MILLISECONDS)) != null) {
                if (predicate.test(frame)) {
                    return frame;
                }
            }
            return null;
        }
    }
}
