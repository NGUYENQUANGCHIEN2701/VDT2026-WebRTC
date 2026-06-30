# Phase 8: Screen Share, Recording & Device Control - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-06-30
**Phase:** 8-screen-share-recording-device-control
**Areas discussed:** Recording scope, recording indicator, screen share behavior, group-call scope, device controls, device-switch state, recording download UX

---

## Recording Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Composited 1-1 file | Remote video main, local self-view overlay, mixed local+remote audio via canvas/AudioContext + MediaRecorder. | yes |
| Remote stream primarily | Lower complexity, but less representative of the full call. | |
| Local-only / remote-only | Simplest, but weak for "record the call". | |

**User's choice:** Composited 1-1 file.
**Notes:** Prioritized demo quality and a recording that feels like a real call recording.

---

## Recording Indicator

| Option | Description | Selected |
|--------|-------------|----------|
| Remote sees indicator | Relay recording state over signaling, similar to media-state. | yes |
| Local-only state | Easier, but fails the roadmap success criterion. | |
| Indicator plus toast | More UI, optional. | |

**User's choice:** Remote sees recording indicator.
**Notes:** Must be visible to the other 1-1 participant while recording runs.

---

## Screen Share Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Replace camera track | Use getDisplayMedia + replaceTrack; browser-bar stop restores camera. | yes |
| Add second video stream | Richer but requires extra transceiver/layout work. | |
| Stop share leaves video off | Simpler but weak UX and misses auto-restore criterion. | |

**User's choice:** Replace camera track and restore camera on screen-track ended.
**Notes:** Avoid adding a second video transceiver in Phase 8.

---

## 1-1 vs Group Scope

| Option | Description | Selected |
|--------|-------------|----------|
| 1-1 full, group minimal/safe | Lower risk; group behavior deferred. | |
| Screen/device for both, recording 1-1 | Polished for both call modes while keeping group recording deferred. | yes |
| Everything only 1-1 | Scope smallest, but leaves Phase 7 deferred screen share unresolved. | |
| Custom | User asked whether both 1-1 and group-call could be done cleanly. | yes |

**User's choice:** Do screen share and device switching cleanly for both 1-1 and group-call; keep recording 1-1.
**Notes:** Group-call recording remains deferred because it is a separate heavy capability.

---

## Device Control UX

| Option | Description | Selected |
|--------|-------------|----------|
| More panel | Camera, Microphone, Speaker selectors live under the existing More control. | yes |
| Dropdowns beside buttons | Faster but visually crowded. | |
| Settings modal | Clear but heavier than needed for MVP. | |

**User's choice:** More panel.
**Notes:** Applies to both `CallPage` and `GroupCallPage`; speaker selector is hidden without setSinkId.

---

## Device Switch State

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve current state | New mic/camera inherits current mute/cam-off state before replaceTrack. | yes |
| Auto-enable after switch | Easier to see device working, but can surprise users. | |
| Ask when muted/off | Safe but interrupts the call flow. | |

**User's choice:** Preserve mute/cam-off state.
**Notes:** Avoids unexpectedly enabling audio/video.

---

## Recording Download UX

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-create download | Stop recording creates and downloads a `.webm`. | |
| Preview plus Download | Stop recording shows a playable preview and explicit Download action. | yes |
| Download plus history metadata | Expands history/API scope. | |

**User's choice:** Preview plus Download.
**Notes:** User explicitly prioritized a better experience. No server upload or history metadata in Phase 8.

---

## the agent's Discretion

- Exact `MediaRecorder` codec fallback ladder.
- Exact internal module structure for recording and device services.
- Exact visual treatment for the recording badge, More panel, and recording preview.
- Exact signaling record names for recording state.

## Deferred Ideas

- Group-call recording/compositing (ADV-05).
- Recording upload/storage/retention.
- Recording metadata in call history.
- A second video stream for screen share plus camera.
