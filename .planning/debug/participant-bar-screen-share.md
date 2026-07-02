---
status: awaiting_human_verify
trigger: "Thanh danh sách người tham gia (participant bar / thumbnails) không đồng bộ khi có người chia sẻ màn hình trong group call. Từ 2 screenshot của user (video call 3 người, nguyenquanglap2k7 đang share màn hình VS Code): giữa 2 thời điểm gần nhau (00:41 và 00:56), các thumbnail người tham gia bên phải thay đổi không nhất quán — từ góc nhìn của người XEM (không phải người đang share), thanh người tham gia hiển thị 2 tile đều giống như đang là người chia sẻ (nội dung trùng lặp/giống output của người share) thay vì mỗi tile hiển thị đúng camera feed riêng của từng participant."
created: 2026-07-02
updated: 2026-07-02
---

## Symptoms

- **Expected behavior:** Trong group call khi có người bắt đầu chia sẻ màn hình, thanh danh sách người tham gia (thumbnail bar) phải hiển thị đúng: khung chia sẻ chính hiển thị nội dung màn hình của người share, còn các tile còn lại trong thanh người tham gia phải hiển thị camera feed thật, sống của từng người tham gia khác — không trùng lặp, không lẫn nội dung share vào tile của người khác.
- **Actual behavior:** Từ góc nhìn của những người XEM (không phải người đang chia sẻ), thanh người tham gia hiển thị sai — có nhiều hơn 1 tile trong thanh cùng hiển thị giống như đang là người chia sẻ (nội dung bị trùng lặp/giống output của người share) thay vì mỗi tile hiển thị đúng camera của từng participant riêng biệt. Giữa 2 thời điểm gần nhau trong cùng phiên gọi, layout/thumbnail cũng thay đổi không nhất quán (số lượng tile hiển thị, nội dung từng tile).
- **Error messages:** Chưa kiểm tra console trình duyệt (F12), không có log lỗi được ghi lại — thuần là visual/state-sync bug quan sát được qua UI.
- **Timeline:** Đã gặp trước đó rồi, lặp lại nhiều lần qua các lần test group call + screen share khác nhau — không phải lần đầu. Đã tồn tại qua các fix trước đó liên quan đến group-call screen-share layout (xem .planning/quick/260701-tkz-fix-group-call-recording-to-mirror-the-o và .planning/quick/260701-u3j-sync-screen-share-focus-across-all-group) mà có vẻ chưa dứt điểm hết mọi trường hợp.
- **Reproduction:** Mở group call 3 người (VD nguyenquanglap2k7, nqchien, nqc). Một người (nguyenquanglap2k7) bắt đầu chia sẻ màn hình. Từ view của một người KHÔNG chia sẻ (viewer), quan sát thanh danh sách người tham gia (thumbnail bar bên phải màn hình) — thấy nhiều hơn 1 tile hiển thị nội dung giống màn hình đang share thay vì camera riêng của từng người, và bố cục thumbnail thay đổi không nhất quán giữa các thời điểm gần nhau trong cùng phiên gọi.

## Current Focus

hypothesis: "CONFIRMED — presentation-thumbnails renders remoteMembers unfiltered, so a remote activeSharer's own tile is duplicated in the participant bar showing raw screen content instead of a distinct camera feed."
test: "Read GroupCallPage.tsx presentation-layout branches, roomActions.ts track-replace logic, and prior quick-task summaries (260701-u3j, 260701-tkz) to confirm the thumbnail strip intentionally includes the sharer and whether the architecture supports a separate camera feed for a sharing remote peer."
expecting: "If hypothesis true: remoteMembers used for presentation-thumbnails is not filtered to exclude activeSharer, and the app only has ONE video track per peer (replaced, not added) — so that duplicate tile shows literal screen content, not camera."
next_action: "Fix applied and self-verified (tsc clean, 63/63 vitest pass incl. 2 new regression tests). Awaiting human verification via live 3-browser-tab group call test — cannot be verified headlessly (real getUserMedia/getDisplayMedia + WebRTC track negotiation)."
reasoning_checkpoint:
  hypothesis: "The participant thumbnail bar shows duplicate sharer-like content because presentation-thumbnails maps over `remoteMembers` (roster minus self) without excluding `activeSharer` when the sharer is a remote participant. Since screen sharing is implemented as a single video-track REPLACEMENT on the existing peer connection (RTCRtpSender.replaceTrack in startRoomScreenShare/roomActions.ts, not a second added track), `getRoomRemoteStream(activeSharer)` returns the SAME MediaStream object for both `presentation-main` and the sharer's leftover entry in `presentation-thumbnails` — so that thumbnail literally shows the live screen content a second time instead of a live camera feed."
  confirming_evidence:
    - "roomActions.ts startRoomScreenShare(): `await activeMesh.replaceVideoTrack(screenTrack); replaceTrackInStream(stream, cameraTrack, screenTrack)` — confirms single video track is replaced in-place on the existing stream/connection, no separate screen track is added alongside the camera track."
    - "GroupCallPage.tsx remote-sharer branch (~line 364): `presentation-thumbnails` maps `remoteMembers.map(...)` and `remoteMembers = roster.filter(m => m.username !== selfId)` — this list is NOT filtered by `activeSharer`, so the sharer's own RoomMember entry renders a second ParticipantTile fed by the identical getRoomRemoteStream(activeSharer) stream already shown large in presentation-main."
    - "Quick-task 260701-u3j SUMMARY.md explicitly documents this as an intentional decision: 'The thumbnail strip still includes the sharer's own thumbnail if remote (unchanged, matches Meet/Zoom convention).' The Meet/Zoom analogy assumes a separate camera track exists alongside the screen track — false for this codebase's single-track-replace architecture — so the intentional decision produces a duplicate instead of the intended live-camera thumbnail."
    - "recording.ts draw() has the identical documented assumption ('Thumbnail strip still includes the sharer's own thumbnail if they are a remote participant ... do not filter remoteVideos') establishing that both the live UI and the recording compositor share this same flawed premise by design (quick-task 260701-tkz's stated goal was pixel-parity between the two)."
  falsification_test: "Filter the sharer's username out of the thumbnail-rendering list (remoteMembers.filter(m => m.username !== activeSharer)). If the participant bar then shows only distinct, correct camera feeds for the remaining (non-sharing) participants with no duplicate/screen-like tile, hypothesis confirmed. If a duplicate-looking tile still appears after this filter, hypothesis is wrong — would need to investigate MeshManager/PeerManager's remoteStreams map for cross-wiring between peer entries instead."
  fix_rationale: "Excluding the active sharer from the thumbnail list addresses the structural cause (no separate camera feed exists to legitimately show there) rather than a symptom-level cosmetic fix (e.g. adding a Screen badge to the duplicate tile would still show duplicated content, just labeled). The sharer is already represented large in presentation-main, so omitting them from the bar is the only representation consistent with what the architecture can actually provide, and it directly satisfies the reported expectation: 'mỗi tile hiển thị đúng camera feed riêng của từng participant.'"
  blind_spots: "(1) Not manually verified with a live 3-browser-tab session — matches u3j/tkz's own summaries which also skipped this manual step. (2) The symptom's secondary observation ('layout thay đổi không nhất quán giữa 2 thời điểm gần nhau') may be a separate WS-relay timing race (video content changes instantly via replaceTrack, but activeSharer/isScreenSharing flag depends on a slower media-state-relay round trip) — this fix does not address that possible race; flagging for human verification. (3) Applying the identical filter to recording.ts is same-root-cause but technically outside the user's narrowly reported live-UI symptom — doing it anyway to preserve the tkz-established live/recording parity invariant, will call out explicitly to user."
tdd_checkpoint: null

## Evidence

- timestamp: 2026-07-02T00:00:00Z
  checked: frontend/src/realtime/roomActions.ts (startRoomScreenShare/stopRoomScreenShare)
  found: Screen share is implemented via RTCRtpSender.replaceTrack() on the existing video sender plus replaceTrackInStream() swapping the track inside the same local MediaStream object — a single video track is REPLACED, never a second track added.
  implication: A remote peer's MediaStream (as seen by `getRoomRemoteStream`) has exactly one video track at any time; while that peer is screen sharing, there is no separate camera track available to show elsewhere in the UI for that peer.

- timestamp: 2026-07-02T00:00:00Z
  checked: frontend/src/pages/GroupCallPage.tsx (presentation-layout JSX, both self-sharer and remote-sharer branches)
  found: "`remoteMembers = roster.filter(m => m.username !== selfId)` is reused unfiltered for `presentation-thumbnails` in the remote-sharer branch (~line 364-377), so when `activeSharer` is a remote user, that user's RoomMember is rendered a second time in the thumbnail strip via `getRoomRemoteStream(activeSharer)` — the exact same stream already shown in presentation-main."
  implication: Confirms the duplicate-tile mechanism exactly matches the reported symptom (viewer sees more than one tile showing sharer-like content).

- timestamp: 2026-07-02T00:00:00Z
  checked: .planning/quick/260701-u3j-.../260701-u3j-SUMMARY.md and frontend/src/webrtc/recording.ts (draw() comment, lines 383-385)
  found: Both files explicitly document the sharer-stays-in-thumbnails behavior as an intentional decision reasoned by analogy to Meet/Zoom (which use separate camera+screen tracks). This codebase does not have a separate camera track for a sharing peer, so the analogy does not hold.
  implication: This is a known, documented, but incorrect design assumption from a previous quick-task — not a random regression. Confirms root cause and gives a precise, minimal fix target (exclude activeSharer from the thumbnail list) rather than a deeper architectural problem.

## Eliminated

## Resolution

root_cause: "GroupCallPage.tsx's presentation-mode thumbnail strip (`presentation-thumbnails`) renders `remoteMembers` without excluding the current `activeSharer`. Because screen sharing replaces the peer's single video track in place (RTCRtpSender.replaceTrack, roomActions.ts) rather than adding a second camera track, a remote sharer's leftover thumbnail entry shows the identical live screen-share MediaStream already displayed in presentation-main — a visual duplicate instead of a distinct camera feed. This was an intentional-but-incorrect design decision from quick-task 260701-u3j (reasoned by false analogy to Meet/Zoom's dual-track model), also mirrored in recording.ts's canvas compositor."
fix: "GroupCallPage.tsx: added `thumbnailMembers = remoteMembers.filter(m => m.username !== activeSharer)` and switched both presentation-mode `presentation-thumbnails` blocks (self-sharer and remote-sharer branches) to map over `thumbnailMembers` instead of unfiltered `remoteMembers`. recording.ts: mirrored the same exclusion in `draw()`'s sharing branch — `thumbnailVideos = this.remoteVideos.filter(r => r.label !== sharer)`, used both for `computePresentationLayout`'s remoteCount and the thumbnail draw loop — to preserve the established live/recording layout-parity invariant from quick-task 260701-tkz."
verification: "Self-verified (automatable parts only — this is a live WebRTC visual bug, cannot be fully verified headlessly): `npx tsc --noEmit -p tsconfig.app.json` clean, no type errors. `npx vitest run` — 63/63 tests pass (61 pre-existing + 2 new regression tests added: 'excludes bob from the thumbnail strip when bob is sharing' and 'keeps both remotes when local is sharing (neither is the sharer)'). Independently re-verified in continuation session: tsc clean (re-run), 63/63 vitest pass (re-run), `npx eslint` on all 3 changed files clean (no errors/warnings), `npx vite build` production build succeeds. Full manual 3-browser-tab group call + screen share verification NOT YET performed — requires human checkpoint."
files_changed:
  - "frontend/src/pages/GroupCallPage.tsx"
  - "frontend/src/webrtc/recording.ts"
  - "frontend/src/webrtc/recording.test.ts"
</content>
