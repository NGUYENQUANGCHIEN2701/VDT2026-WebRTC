package com.vdt.webrtc.admin;

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
import com.vdt.webrtc.history.CallHistory;
import com.vdt.webrtc.history.CallHistoryRepository;
import com.vdt.webrtc.user.Role;
import com.vdt.webrtc.user.User;
import com.vdt.webrtc.user.UserRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AdminHistoryApiTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    UserRepository userRepository;
    @Autowired
    CallHistoryRepository repo;

    @BeforeEach
    void clean() {
        repo.deleteAll();
    }

    private void register(String u) throws Exception {
        mockMvc.perform(post("/api/auth/register").contentType("application/json")
                .content("{\"username\":\"" + u + "\",\"password\":\"Password123\",\"email\":\"" + u + "@test.com\"}"));
    }

    private String login(String u) throws Exception {
        MvcResult res = mockMvc.perform(post("/api/auth/login").contentType("application/json")
                .content("{\"username\":\"" + u + "\",\"password\":\"Password123\"}"))
                .andExpect(status().isOk()).andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asString();
    }

    private String adminToken(String u) throws Exception {
        register(u);
        User x = userRepository.findByUsername(u).orElseThrow();
        x.setRole(Role.ADMIN);
        userRepository.save(x);
        return login(u);
    }

    // consumer ghi 2 dòng/cuộc — seed y vậy để test lọc OUTGOING ra đúng 1
    private void seedCall(String callId, String caller, String callee) {
        repo.save(CallHistory.builder().callId(callId).viewerId(caller).peerId(callee)
                .direction("OUTGOING").endReason("completed").endedAt(Instant.now()).build());
        repo.save(CallHistory.builder().callId(callId).viewerId(callee).peerId(caller)
                .direction("INCOMING").endReason("completed").endedAt(Instant.now()).build());
    }

    @Test
    void adminHistory_oneRowPerCall_bothParties() throws Exception {
        String admin = adminToken("histadmin");
        seedCall("call-x", "alice", "bob");

        MvcResult res = mockMvc.perform(get("/api/admin/history").header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk()).andReturn();
        JsonNode content = objectMapper.readTree(res.getResponse().getContentAsString()).get("content");

        assertThat(content).hasSize(1); // 2 dòng DB → 1 dòng admin (direction OUTGOING)
        assertThat(content.get(0).get("callerId").asString()).isEqualTo("alice");
        assertThat(content.get(0).get("calleeId").asString()).isEqualTo("bob");
    }

    @Test
    void adminHistory_filterByUsername() throws Exception {
        String admin = adminToken("histadmin2");
        seedCall("call-a", "alice", "bob");
        seedCall("call-c", "carol", "dave");

        MvcResult res = mockMvc.perform(get("/api/admin/history?username=alice")
                .header("Authorization", "Bearer " + admin)).andExpect(status().isOk()).andReturn();
        String json = res.getResponse().getContentAsString();
        JsonNode content = objectMapper.readTree(json).get("content");

        assertThat(content).hasSize(1);
        assertThat(json).contains("alice");
        assertThat(json).doesNotContain("carol");
    }

    @Test
    void adminHistory_nonAdmin_returns403() throws Exception {
        register("histuser");
        String token = login("histuser");
        mockMvc.perform(get("/api/admin/history").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }
}
