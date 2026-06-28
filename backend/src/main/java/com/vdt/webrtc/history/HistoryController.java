package com.vdt.webrtc.history;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.vdt.webrtc.history.dto.HistoryPageResponse;

@RestController
@RequestMapping("/api/history")
public class HistoryController {
    private final CallHistoryService callHistoryService;

    public HistoryController(CallHistoryService callHistoryService) {
        this.callHistoryService = callHistoryService;
    }

    @GetMapping
    public HistoryPageResponse getHistory(Authentication auth, @RequestParam(required = false) String before,
            @RequestParam(defaultValue = "20") int size) {
        return callHistoryService.getHistory(auth.getName(), before, size);
    }
}
