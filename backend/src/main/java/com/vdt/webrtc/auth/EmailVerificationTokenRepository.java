package com.vdt.webrtc.auth;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.vdt.webrtc.user.User;

@Repository
public interface EmailVerificationTokenRepository extends JpaRepository<EmailVerificationToken, Long> {
    Optional<EmailVerificationToken> findTopByUserAndUsedFalseOrderByCreatedAtDesc(User user);

    @Modifying
    @Query("update EmailVerificationToken t set t.used = true where t.user = :user and t.used = false")
    int markAllUnusedByUserAsUsed(@Param("user") User user);

    @Modifying
    @Query("delete from EmailVerificationToken t where t.expiresAt < :now and t.used = true")
    int deleteUsedExpired(@Param("now") Instant now);
}
