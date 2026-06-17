---
phase: 3
slug: 1-1-p2p-call-core-nat-traversal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (BE)** | JUnit 5 + Mockito + Testcontainers (Postgres) |
| **Framework (FE)** | Vitest 4.x + jsdom; Playwright E2E (call) deferred to Phase 9 |
| **Config file** | `backend/pom.xml`, `frontend/vitest.config` (Vite) |
| **Quick run command (BE)** | `./backend/mvnw.cmd -f backend/pom.xml test -Dtest=<name>` |
| **Quick run command (FE)** | `cd frontend && npx vitest run <path>` |
| **Full suite command** | BE: `./backend/mvnw.cmd -f backend/pom.xml test` · FE: `cd frontend && npx vitest run` |
| **Estimated runtime** | BE ~60-120s (Testcontainers) · FE ~5-35s |

---

## Sampling Rate

- **After every task commit:** Run the relevant quick command (BE or FE).
- **After every plan wave:** Run the full suite for the side(s) touched.
- **Before `/gsd-verify-work`:** Full suite green + manual 2-device call check.
- **Max feedback latency:** ~120 seconds (BE Testcontainers).

---

## Per-Task Verification Map

> Populated by the planner / nyquist auditor from RESEARCH §Validation Architecture and each PLAN.md's tasks.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (TBD) | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> To be finalized by the planner. Expected: signaling relay integration test (sendToUser routes opaquely; server stamps `from`), TURN credential HMAC unit test, getUserMedia error-mapping unit test. WebRTC media handshake is **manual-only** (real browser, fake devices in CI is Phase 9).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 2 user thấy + nghe nhau, media P2P | CALL-01 | Cần 2 trình duyệt thật + media; E2E fake-media là Phase 9 | Mở 2 trình duyệt (mkcert HTTPS), gọi, xác nhận video/audio 2 chiều; debug panel hiện ICE type |
| Vượt NAT qua TURN | INFR-01 | Cần mạng/NAT thật + coturn | Bật forced-relay (`iceTransportPolicy:'relay'`), xác nhận candidate type = relay, call vẫn chạy |
| getUserMedia lỗi → fallback | MEDIA-05 | Cần từ chối quyền/ngắt thiết bị thật | Từ chối quyền cam → thấy thông báo + fallback audio-only |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (or documented manual-only)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
