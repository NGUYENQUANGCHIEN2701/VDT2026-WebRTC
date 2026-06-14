package com.vdt.webrtc.user;

import org.springframework.stereotype.Service;

import com.vdt.webrtc.user.dto.UserProfile;

@Service
public class UserService {
    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public UserProfile findUserProfileByUsername(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found"));
        
        return new UserProfile(user.getUsername(), user.getEmail(), user.getRole().name());
    }
}
