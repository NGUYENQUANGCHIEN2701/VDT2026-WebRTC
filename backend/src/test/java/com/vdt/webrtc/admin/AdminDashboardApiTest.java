package com.vdt.webrtc.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.vdt.webrtc.TestcontainersConfiguration;
import com.vdt.webrtc.user.Role;
import com.vdt.webrtc.user.User;
import com.vdt.webrtc.user.UserRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AdminDashboardApiTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    UserRepository userRepository;

    private void register(String u) throws Exception {
        mockMvc.perform(post("/api/auth/register").contentType("application/json")
                .content("{\"username\":\"" + u + "\",\"password\":\"Password123\",\"confirmPassword\":\"Password123\",\"email\":\"" + u + "@test.com\"}"));
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

    @Test
    void dashboard_returnsExpectedFields() throws Exception {
        String admin = adminToken("dashadmin");
        MvcResult res = mockMvc.perform(get("/api/admin/dashboard")
                .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk()).andReturn();
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        assertThat(body.has("onlineUsers")).isTrue();
        assertThat(body.has("activeCalls")).isTrue();
        assertThat(body.has("todayStarted")).isTrue();
        assertThat(body.has("todayCompleted")).isTrue();
        assertThat(body.has("todayMissed")).isTrue();
    }

    @Test
    void dashboard_nonAdmin_returns403() throws Exception {
        register("dashuser");
        String token = login("dashuser");
        mockMvc.perform(get("/api/admin/dashboard").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }
}
