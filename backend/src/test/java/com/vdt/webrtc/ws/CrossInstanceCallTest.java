package com.vdt.webrtc.ws;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

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

/**
 * Test xương sống của Phase 6: 2 ApplicationContext (inst1/inst2) cùng dùng 1
 * Redis,
 * Alice nối inst1 và Bob nối inst2 → signaling phải đi xuyên Redis pub/sub.
 * RED ở Wave 1 (chưa có RedisMessageRouter); GREEN ở Wave 2.
 *
 * KHÔNG dùng @SpringBootTest — tự quản 2 context và container.
 */
class CrossInstanceCallTest {

    // 1 bộ container dùng chung cho cả 2 instance (giống production)
    static GenericContainer<?> redis;
    static PostgreSQLContainer<?> postgres;
    static RabbitMQContainer rabbitmq;

    static ConfigurableApplicationContext ctx1; // inst1
    static ConfigurableApplicationContext ctx2; // inst2
    static int port1;
    static int port2;

    @BeforeAll
    static void startAll() {
        redis = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
        postgres = new PostgreSQLContainer<>("postgres:17-alpine");
        rabbitmq = new RabbitMQContainer("rabbitmq:4.1-management");
        redis.start();
        postgres.start();
        rabbitmq.start();

        ctx1 = bootInstance("inst1"); // chạy tuần tự: ctx1 migrate DB xong rồi mới tới ctx2
        ctx2 = bootInstance("inst2");
        port1 = serverPort(ctx1);
        port2 = serverPort(ctx2);
    }

    /**
     * Dựng 1 instance Spring với property trỏ vào các container dùng chung +
     * instance-id riêng.
     */
    private static ConfigurableApplicationContext bootInstance(String instanceId) {
        return new SpringApplicationBuilder(WebrtcApplication.class)
                .run( // dùng "--" = command-line args → ưu tiên CAO hơn application.yaml
                        "--server.port=0",
                        "--app.instance-id=" + instanceId,
                        "--call.ring-timeout-seconds=5",
                        // Redis dùng chung
                        "--spring.data.redis.host=" + redis.getHost(),
                        "--spring.data.redis.port=" + redis.getMappedPort(6379),
                        // Postgres dùng chung
                        "--spring.datasource.url=" + postgres.getJdbcUrl(),
                        "--spring.datasource.username=" + postgres.getUsername(),
                        "--spring.datasource.password=" + postgres.getPassword(),
                        // RabbitMQ dùng chung
                        "--spring.rabbitmq.host=" + rabbitmq.getHost(),
                        "--spring.rabbitmq.port=" + rabbitmq.getAmqpPort(),
                        "--spring.rabbitmq.username=" + rabbitmq.getAdminUsername(),
                        "--spring.rabbitmq.password=" + rabbitmq.getAdminPassword());
    }

    private static int serverPort(ConfigurableApplicationContext ctx) {
        return Integer.parseInt(ctx.getEnvironment().getProperty("local.server.port"));
    }

    @AfterAll
    static void stopAll() {
        if (ctx1 != null)
            ctx1.close();
        if (ctx2 != null)
            ctx2.close();
        if (rabbitmq != null)
            rabbitmq.stop();
        if (postgres != null)
            postgres.stop();
        if (redis != null)
            redis.stop();
    }

    @BeforeEach
    void flushRedis() { // mỗi test bắt đầu với Redis sạch (route/presence/call-state không rò)
        ctx1.getBean(StringRedisTemplate.class)
                .getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    // ---- helper kết nối WS ----
    private final StandardWebSocketClient client = new StandardWebSocketClient();
    // mọi session mở trong 1 test, để @AfterEach đóng sạch (cô lập giữa các test)
    private final List<WebSocketSession> opened = new CopyOnWriteArrayList<>();

    private WebSocketSession connect(int port, String token, CollectingHandler h) throws Exception {
        WebSocketSession s = client.execute(h, "ws://localhost:" + port + "/ws?token=" + token)
                .get(5, TimeUnit.SECONDS);
        opened.add(s);
        return s;
    }

    @AfterEach
    void closeSessions() {
        for (WebSocketSession s : opened) {
            try {
                if (s.isOpen()) {
                    s.close();
                }
            } catch (Exception ignored) {
                // đóng best-effort
            }
        }
        opened.clear();
    }

    /** Token mint từ ctx1; vì 2 context cùng JWT secret nên ctx2 cũng chấp nhận. */
    private String mint(String username) {
        return ctx1.getBean(JwtService.class).generateToken(username, "USER");
    }

    /**
     * Chờ tới khi route:{username} được ghi vào Redis. connect() trả về lúc WS
     * handshake xong (client), nhưng afterConnectionEstablished phía server (ghi
     * route map) chạy async — phải chờ route có trước khi dựa vào routing, nếu
     * không sendToUser sẽ thấy route null → message bị bỏ.
     */
    private void awaitRouteRegistered(String username) {
        StringRedisTemplate redis = ctx1.getBean(StringRedisTemplate.class);
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            if (Boolean.TRUE.equals(redis.hasKey("route:" + username))) {
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

    // ====== 3 test RED ======

    @Test // SCAL-01: invite từ inst1 phải tới callee ở inst2
    void crossInstance_callInvite_reachesCallee() throws Exception {
        CollectingHandler hAlice = new CollectingHandler();
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(port1, mint("alice"), hAlice);
        connect(port2, mint("bob"), hBob);
        awaitRouteRegistered("bob"); // chờ server ghi route:bob xong rồi mới invite

        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));

        String ring = hBob.awaitMatching(
                f -> f.contains("call-state-changed") && f.contains("\"state\":\"ringing\""), 10000);
        assertThat(ring).as("Bob ở inst2 phải nhận ringing qua Redis").isNotNull();
        assertThat(ring).contains("\"callerId\":\"alice\"");
    }

    @Test // SCAL-02: presence nhất quán cross-instance
    void crossInstance_presence_isConsistent() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        connect(port2, mint("bob"), hBob);
        connect(port1, mint("alice"), new CollectingHandler());

        // Bob (inst2) phải thấy snapshot có alice (join ở inst1)
        String snap = hBob.awaitMatching(
                f -> f.contains("\"type\":\"presence\"") && f.contains("alice"), 10000);
        assertThat(snap).as("Bob ở inst2 phải thấy alice online").isNotNull();
    }

    @Test // Regression: user nối SAU phải thấy NGAY người đã online từ trước (instance khác).
          // Test cũ nối observer trước nên lọt bug "người mới không nhận snapshot lúc connect".
    void crossInstance_lateJoiner_seesExistingUsers() throws Exception {
        connect(port1, mint("alice"), new CollectingHandler());
        awaitRouteRegistered("alice"); // alice đã online HẲN (presence + route) trước khi bob vào

        CollectingHandler hBob = new CollectingHandler();
        connect(port2, mint("bob"), hBob); // bob nối SAU, ở instance khác

        // Bob phải nhận snapshot chứa alice ngay lúc connect (push đồng bộ),
        // KHÔNG phụ thuộc một presence-event nào fire sau đó.
        String snap = hBob.awaitMatching(
                f -> f.contains("\"type\":\"presence\"") && f.contains("alice"), 10000);
        assertThat(snap).as("Bob nối sau phải thấy alice đã online từ trước").isNotNull();
    }

    @Test // SCAL-02 / D-04: busy (IN_CALL) suy từ user-call:{userId}, thấy cross-instance
    void crossInstance_inCallStatus_isVisible() throws Exception {
        CollectingHandler hBob = new CollectingHandler();
        WebSocketSession alice = connect(port1, mint("alice"), new CollectingHandler());
        WebSocketSession bob = connect(port2, mint("bob"), hBob);
        awaitRouteRegistered("bob"); // chờ server ghi route:bob xong rồi mới invite

        // alice gọi bob, bob accept → bob đang IN_CALL
        alice.sendMessage(new TextMessage("{\"type\":\"call-invite\",\"to\":\"bob\"}"));
        String ring = hBob.awaitMatching(f -> f.contains("\"state\":\"ringing\""), 10000);
        assertThat(ring).as("cần ringing để lấy callId").isNotNull();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"callId\":\"([^\"]+)\"").matcher(ring);
        assertThat(m.find()).isTrue();
        bob.sendMessage(new TextMessage("{\"type\":\"call-accept\",\"callId\":\"" + m.group(1) + "\"}"));

        // Carol nối inst1, phải thấy bob ở trạng thái IN_CALL
        CollectingHandler hCarol = new CollectingHandler();
        connect(port1, mint("carol"), hCarol);
        String snap = hCarol.awaitMatching(
                f -> f.contains("\"type\":\"presence\"") && f.contains("bob") && f.contains("IN_CALL"), 10000);
        assertThat(snap).as("Carol phải thấy bob IN_CALL cross-instance").isNotNull();
    }

    /**
     * Bản sao CollectingHandler từ WsTestSupport (test này không kế thừa
     * WsTestSupport).
     */
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
                if (predicate.test(frame))
                    return frame;
            }
            return null;
        }
    }
}
