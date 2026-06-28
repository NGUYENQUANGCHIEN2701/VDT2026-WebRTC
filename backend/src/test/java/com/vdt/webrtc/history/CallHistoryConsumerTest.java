package com.vdt.webrtc.history;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import com.vdt.webrtc.TestcontainersConfiguration;

@SpringBootTest
@Import(TestcontainersConfiguration.class) // bật Postgres + Redis + RabbitMQ container thật
class CallHistoryConsumerTest {

    @Autowired
    CallHistoryPublisher publisher;

    @Autowired
    CallHistoryRepository repo;

    @BeforeEach
    void clean() {
        repo.deleteAll(); // mỗi test bắt đầu với bảng sạch → không rò sang test kế
    }

    // HIST-01 + HIST-02 + D-06: 1 event → 2 dòng, mỗi bên một góc nhìn
    @Test
    void publishedEvent_persistsTwoRows_perSidePerspective() {
        Instant startedAt = Instant.now().minusSeconds(60);
        Instant endedAt = Instant.now();
        CallHistoryEvent event = new CallHistoryEvent(
                "call-1", "alice", "bob", "completed", startedAt, endedAt);

        publisher.publish(event); // bắn qua RabbitMQ THẬT

        // publish là BẤT ĐỒNG BỘ → không assert ngay được. Chờ tối đa 5s
        // tới khi consumer ghi đủ 2 dòng.
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> assertThat(repo.findByCallId("call-1")).hasSize(2));

        List<CallHistory> rows = repo.findByCallId("call-1");
        CallHistory caller = rows.stream()
                .filter(r -> r.getViewerId().equals("alice")).findFirst().orElseThrow();
        CallHistory callee = rows.stream()
                .filter(r -> r.getViewerId().equals("bob")).findFirst().orElseThrow();

        // góc nhìn người gọi
        assertThat(caller.getDirection()).isEqualTo("OUTGOING");
        assertThat(caller.getPeerId()).isEqualTo("bob");
        // góc nhìn người nhận
        assertThat(callee.getDirection()).isEqualTo("INCOMING");
        assertThat(callee.getPeerId()).isEqualTo("alice");
        // completed + có startedAt → duration ~ 60_000ms
        assertThat(caller.getDurationMs()).isBetween(59_000L, 61_000L);
    }

    // HIST-03: giao trùng (at-least-once) → vẫn đúng 2 dòng, không thành 4
    @Test
    void duplicateDelivery_keepsExactlyTwoRows_idempotent() {
        CallHistoryEvent event = new CallHistoryEvent(
                "call-dup", "alice", "bob", "missed", null, Instant.now());

        publisher.publish(event);
        publisher.publish(event); // giao TRÙNG cùng một event

        // chờ đủ 2 dòng...
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> assertThat(repo.findByCallId("call-dup")).hasSize(2));
        // ...rồi đảm bảo trong 2s tiếp theo KHÔNG nhảy lên 4 (idempotency thật sự)
        await().during(Duration.ofSeconds(2)).atMost(Duration.ofSeconds(4))
                .until(() -> repo.findByCallId("call-dup").size() == 2);
    }
}
