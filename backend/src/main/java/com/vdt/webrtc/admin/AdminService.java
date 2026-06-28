package com.vdt.webrtc.admin;

import java.io.IOException;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;

import com.vdt.webrtc.admin.dto.UserSummary;
import com.vdt.webrtc.common.UserNotFoundException;
import com.vdt.webrtc.user.Role;
import com.vdt.webrtc.user.User;
import com.vdt.webrtc.user.UserRepository;
import com.vdt.webrtc.ws.SessionRegistry;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class AdminService {
    private final UserRepository userRepository;
    private final SessionRegistry sessionRegistry;

    public AdminService(UserRepository userRepository, SessionRegistry sessionRegistry) {
        this.userRepository = userRepository;
        this.sessionRegistry = sessionRegistry;
    }

    public List<UserSummary> listUsers() {
        return userRepository.findAll().stream()
                .map(user -> new UserSummary(
                        user.getId(),
                        user.getUsername(),
                        user.getEmail(),
                        user.getRole().name(),
                        user.isLocked()))
                .toList();
    }

    public void lockUser(String adminUsername, Long targetId) {
        User user = userRepository.findById(targetId).orElseThrow(
                () -> new UserNotFoundException("User not found with id: " + targetId));
        if (user.getUsername().equals(adminUsername)) {
            throw new IllegalArgumentException("Admin không thể khóa tài khoản của chính mình");
        }
        user.setLocked(true);
        userRepository.save(user);
        sessionRegistry.get(user.getUsername()).ifPresent(session -> {
            try {
                session.close(new CloseStatus(4003, "account-locked"));
            } catch (IOException e) {
                log.warn("Không đóng được WS của user bị khóa {}: {}", user.getUsername(), e.getMessage());
            }
        });
    }

    public void unlockUser(Long targetId) {
        User user = userRepository.findById(targetId).orElseThrow(
                () -> new UserNotFoundException("User not found with id: " + targetId));
        user.setLocked(false);
        userRepository.save(user);
    }

    public void changeRole(String adminUsername, Long targetId, String roleName) {
        User user = userRepository.findById(targetId).orElseThrow(
                () -> new UserNotFoundException("User not found with id: " + targetId));
        if (user.getUsername().equals(adminUsername)) {
            throw new IllegalArgumentException("Admin không thể thay đổi role của chính mình");
        }
        user.setRole(Role.valueOf(roleName));
        userRepository.save(user);
    }

}
