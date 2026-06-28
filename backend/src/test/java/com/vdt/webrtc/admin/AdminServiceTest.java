package com.vdt.webrtc.admin;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.vdt.webrtc.user.Role;
import com.vdt.webrtc.user.User;
import com.vdt.webrtc.user.UserRepository;
import com.vdt.webrtc.ws.SessionRegistry;

@ExtendWith(MockitoExtension.class)
class AdminServiceTest {

    @Mock
    UserRepository userRepository;
    @Mock
    SessionRegistry sessionRegistry;
    @InjectMocks
    AdminService adminService;

    private User admin() {
        return User.builder().id(1L).username("admin").role(Role.ADMIN).locked(false).build();
    }

    // D-10: admin tự khóa mình → ném lỗi, KHÔNG ghi DB
    @Test
    void lockSelf_throws_andDoesNotSave() {
        when(userRepository.findById(1L)).thenReturn(Optional.of(admin()));

        assertThatThrownBy(() -> adminService.lockUser("admin", 1L))
                .isInstanceOf(IllegalArgumentException.class);

        verify(userRepository, never()).save(any());
    }

    // D-10: admin tự đổi role mình → ném lỗi, KHÔNG ghi DB
    @Test
    void changeRoleSelf_throws_andDoesNotSave() {
        when(userRepository.findById(1L)).thenReturn(Optional.of(admin()));

        assertThatThrownBy(() -> adminService.changeRole("admin", 1L, "USER"))
                .isInstanceOf(IllegalArgumentException.class);

        verify(userRepository, never()).save(any());
    }
}
