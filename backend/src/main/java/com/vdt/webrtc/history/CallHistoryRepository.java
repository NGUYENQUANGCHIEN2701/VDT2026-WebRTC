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

    // trang đầu (before == null): lấy mới nhất
    Page<CallHistory> findByViewerIdOrderByEndedAtDesc(String viewerId, Pageable pageable);

    /// trang kế (before != null): chỉ các cuộc CŨ HƠN con trỏ
    Page<CallHistory> findByViewerIdAndEndedAtLessThanOrderByEndedAtDesc(
            String viewerId, Instant before, Pageable pageable);

    // admin xem TẤT CẢ — direction='OUTGOING' → đúng 1 dòng/cuộc gọi
    Page<CallHistory> findByDirectionOrderByEndedAtDesc(String direction, Pageable pageable);

    // admin lọc theo username (là caller HOẶC callee) — :username luôn khác null
    // khi gọi
    @Query("""
            SELECT h FROM CallHistory h
            WHERE h.direction = 'OUTGOING'
              AND (h.viewerId = :username OR h.peerId = :username)
            ORDER BY h.endedAt DESC
            """)
    Page<CallHistory> findAdminHistoryByUser(@Param("username") String username, Pageable pageable);

}
