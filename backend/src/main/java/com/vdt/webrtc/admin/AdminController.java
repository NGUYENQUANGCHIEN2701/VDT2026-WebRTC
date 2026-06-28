package com.vdt.webrtc.admin;

import java.util.List;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.vdt.webrtc.admin.dto.DashboardDto;
import com.vdt.webrtc.admin.dto.UserSummary;
import com.vdt.webrtc.history.dto.AdminHistoryRow;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/users")
    public List<UserSummary> listUsers() {
        return adminService.listUsers();
    }

    @PatchMapping("/users/{id}/lock")
    public ResponseEntity<Void> lock(@PathVariable Long id, Authentication auth) {
        adminService.lockUser(auth.getName(), id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/users/{id}/unlock")
    public ResponseEntity<Void> unlock(@PathVariable Long id) {
        adminService.unlockUser(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/users/{id}/role")
    public ResponseEntity<Void> changeRole(@PathVariable Long id, @RequestBody Map<String, String> body,
            Authentication auth) {
        adminService.changeRole(auth.getName(), id, body.get("role"));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/dashboard")
    public DashboardDto dashboard() {
        return adminService.getDashboard();
    }

    @GetMapping("/history")
    public Page<AdminHistoryRow> history(
            @RequestParam(required = false, defaultValue = "") String username,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return adminService.getSystemHistory(username, page, size);
    }

}
