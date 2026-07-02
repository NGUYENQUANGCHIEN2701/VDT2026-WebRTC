package com.vdt.webrtc.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotNull(message = "Tên đăng nhập không được để trống")
    @Column(unique = true)
    private String username;

    @NotNull(message = "Mật khẩu không được để trống")
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    private Role role;

    @Column(unique = true)
    @NotNull(message = "Email không được để trống")
    private String email;

    @Column(unique = true)
    private String googleSub;

    @Builder.Default
    @Column(nullable = false)
    private boolean locked = false;

    @Builder.Default
    @Column(nullable = false)
    private boolean emailVerified = true;

}
