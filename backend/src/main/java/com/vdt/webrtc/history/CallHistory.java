package com.vdt.webrtc.history;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "call_history")
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CallHistory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String callId;
    private String viewerId;
    private String peerId;
    private String direction;
    private String endReason;
    private Long durationMs;
    private Instant startedAt;
    private Instant endedAt;
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null)
            createdAt = Instant.now();
    }
}
