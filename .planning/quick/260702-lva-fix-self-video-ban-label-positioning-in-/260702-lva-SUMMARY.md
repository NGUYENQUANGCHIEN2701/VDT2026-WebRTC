---
phase: quick-260702-lva
plan: 01
subsystem: ui
tags: [css, react, webrtc, call-ui]

# Dependency graph
requires: []
provides:
  - Self-view "Bạn" label anchored to the correct positioned ancestor (the PiP thumbnail wrapper) instead of the full call stage
affects: [CallPage.tsx 1-1 call UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wrapper-owns-position pattern: a `-box` wrapper class owns absolute positioning/size for a video widget; the inner `<video>`/placeholder just fills it (inset:0), and any overlay label nests inside the wrapper so it resolves position against the correct positioned ancestor."

key-files:
  created: []
  modified:
    - frontend/src/pages/CallPage.tsx
    - frontend/src/index.css

key-decisions:
  - "Split .self-video into .self-video-box (position/size owner, new) and .self-video (inset:0 fill rule) instead of introducing a third wrapper class name, to minimize the diff and keep the existing .self-video class usable on both the <video> and the camOff placeholder <div>."
  - "Moved object-fit: contain for the presenting state to a descendant selector (.self-video-box--presenting .self-video) since object-fit ownership now lives on the fill rule, not the positioned wrapper."

patterns-established:
  - "Wrapper-owns-position pattern for PiP-style video widgets with overlay labels (see tech-stack.patterns)."

requirements-completed: [QUICK-FIX]

coverage:
  - id: D1
    description: "Self-video 'Bạn' label DOM-nested inside the same positioned wrapper (.self-video-box) as the self-camera video/placeholder, instead of being a stage-level sibling"
    verification:
      - kind: other
        ref: "tsc --noEmit -p tsconfig.app.json (structural/type check only, not a positioning proof)"
        status: pass
    human_judgment: true
    rationale: "CSS positioning correctness can only be confirmed by visually rendering the call UI in a browser across default PiP, camOff, and screen-share presenting states — this is Task 2's checkpoint:human-verify, not yet completed by the user."

# Metrics
duration: 12min
completed: 2026-07-02
status: complete
---

# Quick Task 260702-lva: Fix self-video "Bạn" label positioning Summary

**Wrapped self-view video/placeholder/label in a single `.self-video-box` positioned container so `.self-video-label`'s `position: absolute` resolves against the small PiP thumbnail instead of the full-screen call stage.**

## Performance

- **Duration:** 12 min
- **Tasks:** 1 of 2 (Task 2 is a human-verify checkpoint, pending)
- **Files modified:** 2

## Accomplishments
- `.self-video` split into `.self-video-box` (owns position/size/border/shadow/z-index, previously on `.self-video`) and a new `.self-video` fill rule (`position: absolute; inset: 0; object-fit: cover`) applied to the `<video>` and the camOff placeholder `<div>`.
- `.self-video--presenting` renamed to `.self-video-box--presenting`, now overriding the wrapper's placement during screen share; a new descendant rule `.self-video-box--presenting .self-video { object-fit: contain; }` preserves the prior contain-fit behavior on the presenting video.
- CallPage.tsx now renders the self `<video>`, camOff placeholder, and `.self-video-label` as children of one `<div className="self-video-box" | "self-video-box self-video-box--presenting">`, using the same `activeSharer === "local"` condition that previously toggled the presenting class on the video element directly.
- `.self-video-label` left untouched — it now correctly resolves `bottom: 8px; left: 8px` against `.self-video-box` (its new nearest positioned ancestor).

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap self-view video, camOff placeholder, and label in one positioned container** - `445cafd` (fix)

**Plan metadata:** commit pending (docs artifacts committed separately by orchestrator)

## Files Created/Modified
- `frontend/src/index.css` - `.self-video` split into `.self-video-box` (position owner) + `.self-video` (fill rule); `.self-video--presenting` renamed to `.self-video-box--presenting` with new `.self-video-box--presenting .self-video` object-fit override
- `frontend/src/pages/CallPage.tsx` - self video, camOff placeholder, and `.self-video-label` moved from stage-level siblings into a single `.self-video-box` wrapper `<div>`

## Decisions Made
- See `key-decisions` in frontmatter above.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npx tsc --noEmit -p tsconfig.app.json` and `npx eslint src/pages/CallPage.tsx` both passed clean on the first attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

Task 1's code fix is complete and committed (`445cafd`). **Task 2 (`checkpoint:human-verify`) is NOT complete** — it requires the user to manually run `cd frontend && npm run dev`, open two browser tabs, start a 1-1 call, and visually confirm:
1. The "Bạn" label sits on the bottom edge of the self-camera PiP thumbnail (bottom-right), not floating in the bottom-left corner.
2. The camOff avatar placeholder fills the same PiP box.
3. During screen share, the self-camera view moves to the top-left main stage and the label stays hidden.
4. After stopping screen share, the PiP returns to bottom-right with the label correctly re-anchored.

This quick task should not be considered fully done until the user confirms the above via the checkpoint's resume-signal ("approved" or issue description).

---
*Quick task: 260702-lva*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: frontend/src/pages/CallPage.tsx
- FOUND: frontend/src/index.css
- FOUND: .planning/quick/260702-lva-fix-self-video-ban-label-positioning-in-/260702-lva-SUMMARY.md
- FOUND: commit 445cafd
