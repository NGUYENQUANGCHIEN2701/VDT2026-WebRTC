---
phase: quick-260704-sns
plan: 01
subsystem: docs
tags: [presentation, demo, documentation, vietnamese]
requires: []
provides:
  - docs/presentation/SCRIPT.md
  - docs/presentation/DEMO.md
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - docs/presentation/SCRIPT.md
    - docs/presentation/DEMO.md
  modified: []
key-decisions:
  - "Forced-relay TURN trong DEMO.md ghi đúng cơ chế thật tra được trong code: query param ?relay=1 (frontend/src/realtime/callActions.ts forceRelayEnabled() -> fetchIceConfig -> iceTransportPolicy: 'relay') — không bịa UI toggle"
  - "Số test backend ghi 31 file (find backend/src/test -name '*.java' = 31, gồm 29 test class + 2 file hạ tầng) khớp con số ~31 trong plan"
  - "EC2 trong DEMO.md dùng placeholder <https://domain-hoặc-IP-EC2> theo threat model T-QSNS-01 — không ghi IP/credential thật"
metrics:
  duration: ~15min
  completed: 2026-07-04
status: complete
---

# Quick Task 260704-sns: Presentation Script + Demo Runbook Summary

**One-liner:** Script thuyết trình VDT 10-15 phút (timeline + ghi chú cắt 7-8 phút, số liệu k6 thật từ spikes/MANIFEST.md) và runbook demo 3 phần với forced-relay `?relay=1` tra từ code thật.

## What Was Built

- **docs/presentation/SCRIPT.md** — script văn nói tiếng Việt theo timeline 6 section (mở bài / demo / kiến trúc / con số / benchmark placeholder / kết luận + Q&A), bảng timeline đầy đủ vs bản rút gọn, khối ghi chú cắt xuống 7-8 phút ngay sau bảng. Phần demo chỉ chứa lời bình + link ./DEMO.md; phần kiến trúc dẫn theo 5 sơ đồ trong ../architecture/README.md với ghi chú "chiếu sơ đồ nào"; phần con số kể chuỗi phát hiện k6 (8808 threads / 6% CPU → virtual threads <400ms tới 4000 connection + HikariCP 10 → 303→599ms cross-instance có ghi chú nhiễu) + 287 commits, 10/10 phase, 42 plan, 31+10+1 file test. Section 5 benchmark LiveKit/iroh chỉ có 1 blockquote TODO.
- **docs/presentation/DEMO.md** — runbook 3 phần: (A) chuẩn bị (compose local chính / EC2 dự phòng, gotcha Mail health indicator, tài khoản placeholder, 2 browser profile vì single-session policy, video backup BẮT BUỘC); (B) 7 bước demo đánh số với câu "nói với khán giả" mỗi điểm nhấn — presence, 1-1 + debug panel host/srflx, in-call controls (đánh dấu cắt được), history, cross-instance qua `docker compose exec redis redis-cli GET route:<user>` + Grafana "VDT WebRTC Overview", forced-relay `?relay=1` (tuỳ chọn), bonus mesh/recording; (C) bảng triệu chứng → hành động thay thế, lối thoát cuối là video backup.

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 2a6bd0a | docs(presentation): add VDT presentation script with timeline and 7-8 min cut notes |
| 2 | 1fe8684 | docs(presentation): add live demo runbook with prep checklist and failure fallbacks |

## Verification

- Task 1 automated verify passed: file exists, 14 lần "phút" (≥6), heading benchmark + TODO, link DEMO.md, "8808", link architecture/README.md.
- Task 2 automated verify passed: file exists, `route:`, relay, "dự phòng", "chuẩn bị".
- Emoji check (grep -P dải emoji, locale UTF-8): exit 1 — không có emoji ở cả 2 file.
- `git status` sau 2 commit: chỉ còn `.planning/quick/260704-sns-presentation-script/` untracked (GSD artifacts, orchestrator commit sau) — không file code/ROADMAP.md nào bị sửa.
- Mọi con số truy vết được: 8808 / 500-1000 / <400ms / 4000 / HikariCP 10 / 303→599ms / 100 cặp — từ .planning/spikes/MANIFEST.md; 287 commits — `git rev-list --count HEAD`; 10/10 phase, 42 plan — STATE.md; 31/10/1 file test — đếm trực tiếp trong repo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree HEAD không khớp base SHA kỳ vọng**
- **Found during:** Branch check trước khi bắt đầu
- **Issue:** HEAD worktree = 3a64d81, base kỳ vọng = ad8a192. Kiểm tra cho thấy khác biệt duy nhất là chính commit ad8a192 (chỉ thêm 260704-sns-PLAN.md, 161 dòng, không đụng file nào khác).
- **Fix:** Dùng đúng đường recovery prompt chỉ định: `git show ad8a192:...PLAN.md > ...` để materialize plan; tiếp tục thực thi bình thường. Không sửa/rebase branch.
- **Files modified:** .planning/quick/260704-sns-presentation-script/260704-sns-PLAN.md (untracked, không commit)

Ngoài ra: plan ghi "~31 file test backend" — số thực đếm được là 31 file .java dưới backend/src/test (29 test class + TestcontainersConfiguration + WsTestSupport); SCRIPT.md dùng "31 file test backend", nhất quán với plan.

## Self-Check: PASSED

- FOUND: docs/presentation/SCRIPT.md
- FOUND: docs/presentation/DEMO.md
- FOUND commit 2a6bd0a
- FOUND commit 1fe8684
