package com.vdt.webrtc.admin.dto;

public record DashboardDto(
        long onlineUsers, long activeCalls,
        long todayStarted, long todayCompleted, long todayMissed) {
}
