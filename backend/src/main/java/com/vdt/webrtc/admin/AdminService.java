package com.vdt.webrtc.admin;

import java.util.List;

import org.springframework.stereotype.Service;

import com.vdt.webrtc.admin.dto.UserSummary;
import com.vdt.webrtc.user.UserRepository;

@Service
public class AdminService {
    private final UserRepository userRepository;

    public AdminService(UserRepository userRepository) {
        this.userRepository = userRepository;
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

}
