---
phase: 7
slug: group-mesh-calls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-29
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed validation architecture lives in 07-RESEARCH.md (## Validation Architecture).
> This file is the execution-time sampling contract; the planner populates the
> Per-Task Verification Map as plans are written.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (backend)** | JUnit 5 + Mockito + Testcontainers (existing) |
| **Framework (frontend)** | Vitest 3.x + React Testing Library (existing) |
| **Config file** | `backend/pom.xml`, `frontend/vitest.config.ts` (existing) |
| **Quick run command (backend)** | `./mvnw -q -pl backend test -Dtest=<ClassPattern>` |
| **Quick run command (frontend)** | `cd frontend && npx vitest run <path>` |
| **Full suite command** | `./mvnw verify` (backend) · `cd frontend && npx vitest run` (frontend) |
| **Estimated runtime** | backend ~60–120s (Testcontainers); frontend ~10–20s |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched module (backend `-Dtest=` pattern, or frontend `vitest run <path>`)
- **After every plan wave:** Run the full suite for the affected side(s)
- **Before `/gsd-verify-work`:** Full suite must be green on both sides
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

> Populated by the planner as PLAN.md tasks are written. Each automated task maps to a command;
> WebRTC mesh behaviors that need two live browser contexts are tracked under Manual-Only.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | — | ADV-03 | T-7-01 (server cap bypass) | 5th join rejected server-side regardless of client | integration | `./mvnw -q -pl backend test -Dtest=*RoomCap*` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · Map filled in during planning.*

---

## Wave 0 Requirements

- [ ] Backend: room/cap join test class (Testcontainers Redis) — stubs for ADV-03 success criterion #2 (server-side cap)
- [ ] Frontend: roomStore + MeshManager roster unit test stubs — ADV-03 #1/#3 (roster, partial-mesh failure surfacing)
- [ ] Existing JUnit/Vitest infrastructure covers the rest — no framework install needed (per RESEARCH: zero new packages)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 3–4 users see/hear each other over P2P mesh | ADV-03 #1 | Needs N live browser contexts with real media (mesh peer connections) | Open 3–4 tabs/devices, join one room, confirm each tile shows others' video/audio |
| Partial-mesh failure surfaced per-tile | ADV-03 #3 | Requires killing one peer's connection mid-call | Drop one participant's network; confirm only that tile shows reconnect/failed overlay, others stay connected |
| Per-sender bitrate cap active at ≥3 | ADV-03 #4 | Browser-enforced encoding params, visible only in DebugPanel at runtime | Join with 3+ participants; confirm DebugPanel `maxBitrate` row shows 350 kbps cap; drops to "—" at 2 |

*Mesh media behaviors are inherently manual/E2E (Playwright fake-media optional); server cap + roster logic are automatable.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
