package com.vdt.webrtc.call;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;

import com.vdt.webrtc.TestcontainersConfiguration;

@SpringBootTest // bật cả Spring context thật
@Import(TestcontainersConfiguration.class) // kéo Redis + Postgres container vào
class CallStateMachineTest {

    @Autowired
    CallStateMachine stateMachine;
    @Autowired
    StringRedisTemplate redis;

    @BeforeEach
    void clean() { // mỗi test bắt đầu với Redis trống
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    // Gọi khi không ai bận → tạo OK: state=ringing, set 2 con trỏ user-call
    @Test
    void createCall_whenClean_returnsOk() {
        CreateResult r = stateMachine.createCall("X", "alice", "bob");
        assertThat(r).isEqualTo(CreateResult.OK);
        assertThat(redis.opsForHash().get("call:X", "state")).isEqualTo("ringing");
        assertThat(redis.opsForValue().get("user-call:alice")).isEqualTo("X");
        assertThat(redis.opsForValue().get("user-call:bob")).isEqualTo("X");
    }

    // Callee (bob) đang trong cuộc với người thứ ba (carol) → trả BUSY
    @Test
    void createCall_whenCalleeBusyWithThirdParty_returnsBusy() {
        stateMachine.createCall("C", "bob", "carol"); // bob đang với carol
        assertThat(stateMachine.createCall("X", "alice", "bob"))
                .isEqualTo(CreateResult.BUSY);
    }

    // Hai người gọi nhau: callee (bob) đang gọi ngược lại caller (alice) → trả GLARE
    @Test
    void createCall_whenMutualCall_returnsGlare() {
        stateMachine.createCall("B", "bob", "alice"); // bob gọi alice trước
        assertThat(stateMachine.createCall("X", "alice", "bob")) // alice gọi ngược
                .isEqualTo(CreateResult.GLARE);
    }

    // Chuyển đúng state cũ (ringing→active) → CAS khớp → thành công, state thành active
    @Test
    void transition_withCorrectFromState_succeeds() {
        stateMachine.createCall("X", "alice", "bob"); // ringing
        boolean ok = stateMachine.transition("X", "ringing", "active", null, "alice", "bob");
        assertThat(ok).isTrue();
        assertThat(redis.opsForHash().get("call:X", "state")).isEqualTo("active");
    }

    // Chuyển sai state cũ (đòi 'active' trong khi đang 'ringing') → CAS chặn → trả false
    @Test
    void transition_withWrongFromState_fails() {
        stateMachine.createCall("X", "alice", "bob"); // state đang ringing
        boolean ok = stateMachine.transition("X", "active", "ended", "completed", "alice", "bob");
        assertThat(ok).isFalse(); // kỳ vọng active nhưng đang ringing
    }

    // 20 luồng cùng lúc chuyển ringing→active → CAS đảm bảo đúng 1 luồng thắng (chống race)
    @Test
    void concurrentTransition_onlyOneWinner() throws InterruptedException {
        stateMachine.createCall("X", "alice", "bob"); // ringing
        int threads = 20;
        CountDownLatch start = new CountDownLatch(1); // cò xuất phát chung
        CountDownLatch done = new CountDownLatch(threads);
        AtomicInteger winners = new AtomicInteger();

        for (int i = 0; i < threads; i++) {
            new Thread(() -> {
                try {
                    start.await(); // chờ tất cả sẵn sàng
                    if (stateMachine.transition("X", "ringing", "active", null, "alice", "bob")) {
                        winners.incrementAndGet();
                    }
                } catch (InterruptedException ignored) {
                } finally {
                    done.countDown();
                }
            }).start();
        }

        start.countDown(); // bắn 20 luồng cùng lúc
        done.await();
        assertThat(winners.get()).isEqualTo(1); // CAS: đúng 1 luồng thắng
    }
}
