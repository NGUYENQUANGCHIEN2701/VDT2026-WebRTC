package com.vdt.webrtc.history;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface CallHistoryRepository extends JpaRepository<CallHistory, Long> {
    List<CallHistory> findByCallId(String callId);

    // trang đầu (before == null): lấy mới nhất
    Page<CallHistory> findByViewerIdOrderByEndedAtDesc(String viewerId, Pageable pageable);

    /// trang kế (before != null): chỉ các cuộc CŨ HƠN con trỏ
    Page<CallHistory> findByViewerIdAndEndedAtLessThanOrderByEndedAtDesc(
            String viewerId, Instant before, Pageable pageable);
}
