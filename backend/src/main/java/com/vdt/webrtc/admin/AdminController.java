package com.vdt.webrtc.admin;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.vdt.webrtc.admin.dto.UserSummary;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    
    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/users")
    public List<UserSummary> listUsers(){
        return adminService.listUsers();
    }
}
