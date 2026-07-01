package com.vdt.webrtc.user;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.vdt.webrtc.common.UserNotFoundException;
import com.vdt.webrtc.user.dto.UserProfile;

@Service
public class UserService {
    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public UserProfile findUserProfileByUsername(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UserNotFoundException("User not found"));
        
        return new UserProfile(user.getUsername(), user.getEmail(), user.getRole().name());
    }

    public List<UserProfile> findAllStandardUsers() {
        return userRepository.findAll().stream()
                .filter(u -> u.getRole() != Role.ADMIN && !u.isLocked())
                .map(u -> new UserProfile(u.getUsername(), u.getEmail(), u.getRole().name()))
                .collect(Collectors.toList());
    }
}
