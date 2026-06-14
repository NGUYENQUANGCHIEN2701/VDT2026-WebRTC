package com.vdt.webrtc.user;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.vdt.webrtc.user.dto.UserProfile;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/me")
    public UserProfile getCurrentUser(Authentication authentication) {
        String username = authentication.getName();
        UserProfile user = userService.findUserProfileByUsername(username);
        return user;
    }

}
