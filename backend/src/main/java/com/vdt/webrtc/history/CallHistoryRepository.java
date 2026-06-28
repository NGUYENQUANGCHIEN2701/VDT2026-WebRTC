package com.vdt.webrtc.history;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface CallHistoryRepository extends JpaRepository<CallHistory, Long> {
    List<CallHistory> findByCallId(String callId);

    @Query("""
            SELECT h FROM CallHistory h
            WHERE h.viewerId = :viewerId
              AND (:before IS NULL OR h.endedAt < :before)
            ORDER BY h.endedAt DESC
            """)
    Page<CallHistory> findByViewer(@Param("viewerId") String viewerId,
            @Param("before") Instant before,
            Pageable pageable);
}
