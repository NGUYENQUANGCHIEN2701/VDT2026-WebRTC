---
phase: quick
plan: 260701-u3j
subsystem: group-call-screen-share
tags: [webrtc, room, redis, recording, screen-share]
dependency-graph:
  requires: [phase-6-cross-instance-room-routing, phase-7-group-mesh]
  provides: [server-authoritative-single-sharer-lock, synced-presentation-mode, sharer-aware-recording]
  affects: [PresenceWebSocketHandler, RoomService, RoomRepository, roomStore, roomActions, GroupCallPage, RecordingController]
tech-stack:
  added: []
  patterns:
    - "Atomic Redis Lua claim script (GET-check-then-SET) for a per-room single-holder lock, mirroring the existing join_room.lua/leave_room.lua conventions"
    - "Server rewrites a client's claimed boolean (isScreenSharing) to the authoritative outcome before relaying, rather than trusting or silently dropping the client's claim"
    - "Pure derivation function (getActiveSharer) shared across store, client-side pre-check, JSX, and RecordingController to avoid duplicating 'who is the sharer' logic"
key-files:
  created:
    - backend/src/main/resources/scripts/claim_room_sharer.lua
    - backend/src/test/java/com/vdt/webrtc/ws/RoomScreenShareGuardTest.java
  modified:
    - backend/src/main/java/com/vdt/webrtc/ws/message/MediaState.java
    - backend/src/main/java/com/vdt/webrtc/ws/message/MediaStateRelay.java
    - backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java
    - backend/src/main/java/com/vdt/webrtc/room/RoomRepository.java
    - backend/src/main/java/com/vdt/webrtc/room/RoomService.java
    - frontend/src/realtime/messages.ts
    - frontend/src/store/roomStore.ts
    - frontend/src/realtime/roomActions.ts
    - frontend/src/realtime/callActions.ts
    - frontend/src/realtime/mediaControls.ts
    - frontend/src/pages/GroupCallPage.tsx
    - frontend/src/webrtc/recording.ts
    - frontend/src/webrtc/recording.test.ts
decisions:
  - "1-1 call MediaState path (callActions.ts/mediaControls.ts) now threads the real useCallStore isScreenSharing value through the shared media-state message instead of a literal false default, since callStore already tracks that flag for its own local presentation UI — more correct than a hardcoded default and the server-side room guard does not apply to 1-1 calls regardless (roomOf(sender) == null short-circuits to the unchanged passthrough)."
  - "getActiveSharer(members, selfId, selfIsScreenSharing) implemented as a plain exported pure function in roomStore.ts (not a store selector), reused identically by startRoomScreenShare's client pre-check, GroupCallPage's presentation-layout branch condition, and the RecordingController getActiveSharer callback — single source of truth for 'who is sharing' resolution."
  - "RoomService gained a public roomOf(username) delegate (previously only used internally via RoomRepository) so PresenceWebSocketHandler can branch 1-1 vs room MediaState handling without reaching into RoomRepository directly."
metrics:
  duration: "~35 minutes (continuation from prior session's Task 1 partial work)"
  completed: 2026-07-02
status: complete
---

# Quick Task 260701-u3j: Sync screen-share focus across all group-call participants Summary

Server-authoritative single-sharer lock (atomic Redis Lua claim) plus full-stack propagation so every group-call participant's UI and the recording compositor focus on whoever is actually screen-sharing, not just the sharer's own client.

## What Was Built

**Backend (Task 1):** Added `isScreenSharing` to `MediaState`/`MediaStateRelay`. Added `claim_room_sharer.lua` — an atomic GET-check-then-SET Redis script enforcing one sharer per room (`room-sharer:{roomId}` key, TTL matching the existing room TTL for self-healing on crash). `RoomRepository` exposes `claimSharer`/`releaseSharer`/`currentSharer`; `RoomService` exposes `claimOrRejectScreenShare`/`releaseScreenShareIfHeld` and calls the release path inside `handleLeave` (covers both explicit leave and disconnect, which delegates to `handleLeave`) plus a new public `roomOf(username)` delegate. `PresenceWebSocketHandler`'s `MediaState` branch now checks `roomService.roomOf(username)`: null → unchanged 1-1 passthrough; in a room and claiming `true` → attempt claim and relay the actual outcome (rejected claims relay `isScreenSharing=false`, never the client's claimed `true`); claiming `false` → release if held, relay `false`.

**Frontend protocol + store (Task 2):** `isScreenSharing: boolean` added to the shared `media-state`/`media-state-relay` message types (both call kinds use the same union). `RoomMember` gained `isScreenSharing` (default `false`); `setPeerMediaState` merges it like `micMuted`/`camOff`. New pure helper `getActiveSharer(members, selfId, selfIsScreenSharing)` resolves the single current sharer (self or a specific remote) or `null`. `sendRoomMediaState()` and the `participant-joined` handshake send site now include the flag; the inbound `media-state-relay` handler applies it via `setPeerMediaState`. `startRoomScreenShare()` gained a client-side pre-check using `getActiveSharer` — rejects with a toast before ever calling `getDisplayMedia` if a synced remote member is already sharing (server-side claim remains the authoritative backstop). The 1-1 call send sites (`callActions.ts`, `mediaControls.ts`) were updated to keep compiling under the now-required field, threading through the real `useCallStore` `isScreenSharing` value rather than a hardcoded default.

**Presentation UI + recording (Task 3, TDD):** `GroupCallPage.tsx` derives `activeSharer` via `getActiveSharer(members, selfId, isScreenSharing)` and switches into presentation mode whenever `activeSharer !== null` (any participant sharing), not just the local client's own flag. The presentation-main/speaker JSX branches on whether the sharer is self (unchanged local-stream JSX) or a remote (renders that member's actual remote stream, with `camOff` forced true only in the speaker tile per the existing face-cam-unavailable-while-sharing constraint). The "Sharing screen"/"`{user}` is sharing" HUD pill now reflects any active sharer. `RecordingController`'s `isScreenSharing: () => boolean` option was replaced with `getActiveSharer: () => 'local' | string | null`; a new exported pure helper `selectSharerVideo(sharer, localVideo, remoteVideos)` resolves the correct `HTMLVideoElement` to draw into both the main and speaker canvas regions (falls back to `null`/grid-mode when no one is sharing). The thumbnail strip still includes the sharer's own thumbnail if remote (unchanged, matches Meet/Zoom convention).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking] `PresenceWebSocketHandler` line constructing `MediaStateRelay(username, ms.micMuted(), ms.camOff())` would not compile once `MediaStateRelay` gained a 4th required field**
- **Found during:** Task 1 (continuation) — the interrupted prior session had already added the `isScreenSharing` field to the record but had not yet updated the one call site constructing it.
- **Fix:** Replaced the single unconditional relay call with the full room-guard branch described in the plan's `<action>` (roomOf null-check, claim/reject, release-if-held), which necessarily also fixes the compile error since every branch now supplies all 4 constructor args.
- **Files modified:** `backend/src/main/java/com/vdt/webrtc/ws/PresenceWebSocketHandler.java`
- **Commit:** `3a50d64`

**2. [Rule 3 - blocking] `RoomService` had no public way for `PresenceWebSocketHandler` to query a sender's current room** (`roomOf` previously existed only on `RoomRepository`, used internally by `RoomService`)
- **Found during:** Task 1 implementation — the plan's action text calls for `roomService.roomOf(username)` from `PresenceWebSocketHandler`, but no such method existed on `RoomService`.
- **Fix:** Added a one-line public delegate `RoomService.roomOf(String username)` forwarding to `rooms.roomOf(username)`.
- **Files modified:** `backend/src/main/java/com/vdt/webrtc/room/RoomService.java`
- **Commit:** `3a50d64`

**3. [Rule 1 - bug] Git history rewrite (external, concurrent session) briefly detached the Task 3 commit from `main`**
- **Found during:** post-Task-3 final verification pass. A concurrent process (observed via `git reflog`) checked out a `tmp-reword` branch, cherry-picked and amended the commit chain from an earlier point in history (through the Task 1/Task 2 commits, giving them new hashes with reworded/re-authored metadata), then reset `main` onto that rewritten branch. Because the rewrite branched off before Task 3 was committed, resetting `main` silently dropped the Task 3 commit from history (though its object remained intact and unreachable-but-not-yet-pruned in git's object database) and reverted the three Task-3-modified files in the working tree back to their pre-Task-3 state.
- **Fix:** Located the orphaned Task 3 commit via `git reflog`, confirmed via `git merge-base` that its parent chain matched the pre-rewrite Task 1/Task 2 commits (i.e. same content, different hashes), then `git cherry-pick`'d it cleanly onto the post-rewrite `main` (zero conflicts; `git diff <old-commit> <new-commit> --stat` confirmed byte-identical resulting content). Re-ran the full backend (24 tests) and frontend (52 tests) verification suites afterward to confirm nothing else was disturbed.
- **Files affected:** `frontend/src/pages/GroupCallPage.tsx`, `frontend/src/webrtc/recording.ts`, `frontend/src/webrtc/recording.test.ts`
- **Commit:** `1a33cbc` (cherry-picked recovery of the original Task 3 commit content)
- **No destructive git operations were used to recover** — no `git reset --hard`, no forced pushes; the recovery was a plain cherry-pick of an already-existing commit object.

### Not Auto-fixed / Deferred

None.

## Auth Gates

None encountered — no external service auth was required for this plan.

## Known Stubs

None. All five must-have truths from the plan are implemented end-to-end (server-authoritative lock, synced presentation mode for all participants, sharer-aware recording draw, lock release on stop/leave/disconnect).

## Threat Flags

None beyond what the plan's own `<threat_model>` already accounted for (T-quick260701u3j-01/02/03) — no new network input formats, auth paths, or schema changes were introduced beyond the single `isScreenSharing` boolean field already covered by the plan's threat register.

## Verification

- `cd backend && ./mvnw test -Dtest=RoomScreenShareGuardTest` — 5/5 pass (claim+relay, reject-second-claimant, release-then-reclaim, release-on-leave, 1-1-path-unaffected).
- `cd backend && ./mvnw test -Dtest=RoomMeshTest,RecordingSignalingTest,CallSignalingTest,CallLifecycleTest,RoomScreenShareGuardTest` — 24/24 pass, no regressions.
- `cd frontend && npx tsc --noEmit -p tsconfig.app.json` — clean, no type errors.
- `cd frontend && npx vitest run src/webrtc/recording.test.ts` — 22/22 pass (14 pre-existing + 8 new sharer-selection cases: 4 `selectSharerVideo` unit tests, 3 `RecordingController` draw-target integration tests for local/remote/null sharer).
- `cd frontend && npx vitest run` (full suite) — 52/52 pass across all 6 test files.
- Manual 3-browser-tab smoke test (per plan step 5) was NOT performed in this session — recommended before considering the feature fully done end-to-end.

## Commits

- `3a50d64` — `feat(room): add server-authoritative single-sharer lock`
- `0584261` — `feat(room): sync screen-share state across room members`
- `1a33cbc` — `feat(group-call): focus presentation layout and recording on actual sharer`

## Self-Check: PASSED

- `backend/src/main/resources/scripts/claim_room_sharer.lua` — FOUND
- `backend/src/test/java/com/vdt/webrtc/ws/RoomScreenShareGuardTest.java` — FOUND
- `frontend/src/webrtc/recording.test.ts` new suites (`selectSharerVideo`, `RecordingController — sharer-aware draw path`) — FOUND, all passing
- Commit `3a50d64` — FOUND in `git log --oneline --all`
- Commit `0584261` — FOUND in `git log --oneline --all`
- Commit `1a33cbc` — FOUND in `git log --oneline --all`
- `frontend/src/components/call/GroupCallModal.tsx` — confirmed untouched/unstaged throughout (unrelated Phase 9 work, correctly excluded from all 3 commits)
