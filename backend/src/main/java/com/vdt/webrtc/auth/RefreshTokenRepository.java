package com.vdt.webrtc.auth;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;


@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByTokenHashAndRevokedFalse(String tokenHash);
    
    @Modifying
    @Query("UPDATE RefreshToken r SET r.revoked = true WHERE r.tokenHash = :hash AND r.revoked = false")
    int revokeActiveByHash(@Param("hash") String hash);
}
