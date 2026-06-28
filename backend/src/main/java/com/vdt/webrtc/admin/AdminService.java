package com.vdt.webrtc.admin;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;

import com.vdt.webrtc.admin.dto.DashboardDto;
import com.vdt.webrtc.admin.dto.UserSummary;
import com.vdt.webrtc.common.UserNotFoundException;
import com.vdt.webrtc.history.CallHistory;
import com.vdt.webrtc.history.CallHistoryRepository;
import com.vdt.webrtc.history.dto.AdminHistoryRow;
import com.vdt.webrtc.metrics.CallMetrics;
import com.vdt.webrtc.presence.LocalPresenceService;
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
    private final LocalPresenceService localPresenceService;
    private final StringRedisTemplate redisTemplate;
    private final CallHistoryRepository callHistoryRepository;
    private final CallMetrics callMetrics;

    public AdminService(UserRepository userRepository, SessionRegistry sessionRegistry,
            LocalPresenceService localPresenceService, StringRedisTemplate redisTemplate,
            CallHistoryRepository callHistoryRepository, CallMetrics callMetrics) {
        this.userRepository = userRepository;
        this.sessionRegistry = sessionRegistry;
        this.localPresenceService = localPresenceService;
        this.redisTemplate = redisTemplate;
        this.callHistoryRepository = callHistoryRepository;
        this.callMetrics = callMetrics;
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

    public DashboardDto getDashboard() {
        long onlineUsers = localPresenceService.snapshot().size();
        // mỗi cuộc active có 2 key user-call:* (caller + callee) → /2
        // TODO Phase 6: thay KEYS bằng counter Redis riêng (KEYS blocking khi scale)
        long activeCalls = Optional.ofNullable(redisTemplate.keys("user-call:*"))
                .map(k -> k.size() / 2L).orElse(0L);
        return new DashboardDto(onlineUsers, activeCalls,
                callMetrics.getStarted(), callMetrics.getCompleted(), callMetrics.getMissed());
    }

    public Page<AdminHistoryRow> getSystemHistory(String username, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<CallHistory> rows = (username == null || username.isBlank())
                ? callHistoryRepository.findByDirectionOrderByEndedAtDesc("OUTGOING", pageable)
                : callHistoryRepository.findAdminHistoryByUser(username, pageable);
        return rows.map(h -> new AdminHistoryRow(
                h.getCallId(), h.getViewerId(), h.getPeerId(), h.getEndReason(),
                h.getDurationMs(), h.getStartedAt(), h.getEndedAt()));
    }

}
