package com.vdt.webrtc.auth;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.vdt.webrtc.auth.dto.AuthResponse;
import com.vdt.webrtc.auth.dto.LoginRequest;
import com.vdt.webrtc.auth.dto.RegisterRequest;
import com.vdt.webrtc.auth.dto.RegisterResponse;
import com.vdt.webrtc.common.DuplicateResourceException;
import com.vdt.webrtc.config.JwtService;
import com.vdt.webrtc.user.Role;
import com.vdt.webrtc.user.User;
import com.vdt.webrtc.user.UserRepository;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
            AuthenticationManager authenticationManager) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
    }

    public RegisterResponse register(RegisterRequest request) {
        String email = request.email();
        String username = request.username();
        if (userRepository.existsByEmail(email) || userRepository.existsByUsername(username)) {
            throw new DuplicateResourceException("Email or username already exists");
        }
        String passwordHash = passwordEncoder.encode(request.password());
        Role role = Role.USER;
        User user = User.builder()
                .username(username)
                .email(email)
                .passwordHash(passwordHash)
                .role(role)
                .build();
        userRepository.save(user);
        return new RegisterResponse(username, email, role.name());
    }

    public AuthResponse login(LoginRequest request) {
        String username = request.username();
        String password = request.password();

        authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(username, password));

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new BadCredentialsException("Invalid username or password"));

        String token = jwtService.generateToken(user.getUsername(), user.getRole().name());

        return new AuthResponse(token, username, user.getRole().name());
    }
}
