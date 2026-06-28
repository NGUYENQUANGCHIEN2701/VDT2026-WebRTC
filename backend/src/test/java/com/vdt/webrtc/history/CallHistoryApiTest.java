package com.vdt.webrtc.history;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.vdt.webrtc.TestcontainersConfiguration;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CallHistoryApiTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    CallHistoryRepository repo;

    @BeforeEach
    void clean() {
        repo.deleteAll(); // call_history sạch mỗi test (users giữ nguyên — login lại được)
    }

    // register có thể 409 nếu user đã tồn tại từ test trước → KHÔNG assert, chỉ cần
    // login OK
    private String loginAndGetToken(String username) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .contentType("application/json")
                .content("{\"username\":\"" + username + "\",\"password\":\"Password123\","
                        + "\"email\":\"" + username + "@test.com\"}"));
        MvcResult res = mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"" + username + "\",\"password\":\"Password123\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asString();
    }

    private void seedRow(String callId, String viewer, String peer, Instant endedAt) {
        repo.save(CallHistory.builder()
                .callId(callId).viewerId(viewer).peerId(peer)
                .direction("OUTGOING").endReason("completed").endedAt(endedAt).build());
    }

    private JsonNode getHistory(String token, String query) throws Exception {
        MvcResult res = mockMvc.perform(get("/api/history" + query)
                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString());
    }

    // HIST-02: lịch sử của mình, mới nhất trước
    @Test
    void getHistory_returnsOwnRowsNewestFirst() throws Exception {
        String token = loginAndGetToken("alice");
        Instant now = Instant.now();
        seedRow("c-old", "alice", "bob", now.minusSeconds(120));
        seedRow("c-new", "alice", "bob", now);

        JsonNode items = getHistory(token, "").get("items");

        assertThat(items).hasSize(2);
        assertThat(items.get(0).get("callId").asString()).isEqualTo("c-new"); // mới nhất trước
        assertThat(items.get(1).get("callId").asString()).isEqualTo("c-old");
    }

    // T-05-02: chỉ thấy lịch sử CỦA MÌNH, không xem trộm người khác
    @Test
    void getHistory_scopesToAuthenticatedUser() throws Exception {
        String aliceToken = loginAndGetToken("alice");
        seedRow("alice-call", "alice", "bob", Instant.now());
        seedRow("bob-only", "bob", "carol", Instant.now()); // dòng của bob

        JsonNode body = getHistory(aliceToken, "");

        assertThat(body.get("items")).hasSize(1); // chỉ 1 dòng của alice
        assertThat(body.toString()).doesNotContain("bob-only"); // tuyệt đối không lộ dòng bob
    }

    // HIST-02: phân trang cursor
    @Test
    void getHistory_cursorPagination() throws Exception {
        String token = loginAndGetToken("alice");
        Instant base = Instant.now();
        for (int i = 0; i < 25; i++) {
            seedRow("c-" + i, "alice", "bob", base.minusSeconds(i));
        }

        JsonNode page1 = getHistory(token, "?size=20");
        assertThat(page1.get("items")).hasSize(20);
        assertThat(page1.get("nextCursor").isNull()).isFalse(); // còn trang

        String cursor = page1.get("nextCursor").asString();
        JsonNode page2 = getHistory(token, "?size=20&before=" + cursor);
        assertThat(page2.get("items")).hasSize(5); // 5 dòng còn lại
        assertThat(page2.get("nextCursor").isNull()).isTrue(); // hết trang
    }

    // bảo mật: chưa đăng nhập → bị chặn
    @Test
    void getHistory_unauthenticated_isRejected() throws Exception {
        mockMvc.perform(get("/api/history"))
                .andExpect(status().is4xxClientError()); // 401/403
    }
}
