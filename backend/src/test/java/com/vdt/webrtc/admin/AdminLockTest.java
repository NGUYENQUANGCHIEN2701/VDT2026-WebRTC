package com.vdt.webrtc.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AdminLockTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    UserRepository userRepository;

    private void register(String username) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .contentType("application/json")
                .content("{\"username\":\"" + username + "\",\"password\":\"Password123\",\"confirmPassword\":\"Password123\",\"email\":\""
                        + username + "@test.com\"}"));
    }

    private String login(String username) throws Exception {
        MvcResult res = mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"" + username + "\",\"password\":\"Password123\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asString();
    }

    /**
     * Đăng ký (USER) → NÂNG QUYỀN ADMIN trong DB → login để JWT mang ROLE_ADMIN.
     */
    private String adminToken(String username) throws Exception {
        register(username);
        User u = userRepository.findByUsername(username).orElseThrow();
        u.setRole(Role.ADMIN);
        userRepository.save(u);
        return login(username);
    }

    private long registerUser(String username) throws Exception {
        register(username);
        return userRepository.findByUsername(username).orElseThrow().getId();
    }

    // ADMN-01: admin khóa user → locked=true trong DB
    @Test
    void adminLocksUser_setsLockedTrue() throws Exception {
        String admin = adminToken("boss1");
        long targetId = registerUser("target1");

        mockMvc.perform(patch("/api/admin/users/" + targetId + "/lock")
                .header("Authorization", "Bearer " + admin))
                .andExpect(status().isNoContent());

        assertThat(userRepository.findById(targetId).orElseThrow().isLocked()).isTrue();
    }

    // ADMN-01: user bị khóa → login bị chặn (403, nhờ handler LockedException)
    @Test
    void lockedUser_cannotLogin_returns403() throws Exception {
        String admin = adminToken("boss2");
        long targetId = registerUser("target2");
        mockMvc.perform(patch("/api/admin/users/" + targetId + "/lock")
                .header("Authorization", "Bearer " + admin))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"target2\",\"password\":\"Password123\"}"))
                .andExpect(status().isForbidden());
    }

    // mở khóa → login lại được
    @Test
    void unlockRestoresLogin() throws Exception {
        String admin = adminToken("boss3");
        long targetId = registerUser("target3");
        mockMvc.perform(patch("/api/admin/users/" + targetId + "/lock").header("Authorization", "Bearer " + admin))
                .andExpect(status().isNoContent());
        mockMvc.perform(patch("/api/admin/users/" + targetId + "/unlock").header("Authorization", "Bearer " + admin))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"target3\",\"password\":\"Password123\"}"))
                .andExpect(status().isOk());
    }

    // bảo mật: user thường gọi endpoint admin → 403
    @Test
    void nonAdmin_lockEndpoint_returns403() throws Exception {
        register("eve4");
        String eveToken = login("eve4"); // role USER
        long targetId = registerUser("target4");

        mockMvc.perform(patch("/api/admin/users/" + targetId + "/lock")
                .header("Authorization", "Bearer " + eveToken))
                .andExpect(status().isForbidden());
    }
}
