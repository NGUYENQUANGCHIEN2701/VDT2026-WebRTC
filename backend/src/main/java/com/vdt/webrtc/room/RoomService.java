package com.vdt.webrtc.room;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.vdt.webrtc.metrics.CallMetrics;
import com.vdt.webrtc.ws.MessageRouter;
import com.vdt.webrtc.ws.message.ParticipantJoined;
import com.vdt.webrtc.ws.message.ParticipantLeft;
import com.vdt.webrtc.ws.message.RoomFull;
import com.vdt.webrtc.ws.message.RoomInvite;
import com.vdt.webrtc.ws.message.RoomInviteDeclined;
import com.vdt.webrtc.ws.message.RoomJoined;

@Service
public class RoomService {
    private final RoomRepository rooms;
    private final MessageRouter router;
    private final CallMetrics metrics;

    public RoomService(RoomRepository rooms, MessageRouter router, CallMetrics metrics) {
        this.rooms = rooms;
        this.router = router;
        this.metrics = metrics;
    }

    public void handleGroupInvite(String inviter, List<String> invitees) {
        String roomId = UUID.randomUUID().toString();

        RoomJoinResult result = rooms.join(roomId, inviter);
        if (result != RoomJoinResult.OK) {
            router.sendToUser(inviter, new RoomFull(roomId, "Cannot create room"));
            return;
        }

        RoomInvite invite = new RoomInvite(roomId, inviter, invitees);
        for (String invitee : invitees) {
            if (!invitee.equals(inviter)) {
                router.sendToUser(invitee, invite);
            }
        }
    }

    public void handleCancelGroupInvite(String inviter, List<String> invitees) {
        String roomId = rooms.roomOf(inviter);
        if (roomId == null) {
            return;
        }

        if (invitees != null) {
            for (String invitee : invitees) {
                if (!invitee.equals(inviter)) {
                    router.sendToUser(invitee, new com.vdt.webrtc.ws.message.RoomInviteCancelled(roomId));
                }
            }
        }
        
        rooms.leave(roomId, inviter);
        // The room should be empty now if no one else joined, which means it gets cleaned up.
    }

    public void handleJoin(String username, String roomId) {
        if (roomId == null || roomId.isBlank()) {
            router.sendToUser(username, new RoomFull("", "Invalid room ID"));
            return;
        }
        List<String> membersBeforeJoin = rooms.members(roomId);

        RoomJoinResult result = rooms.join(roomId, username);

        if (result == RoomJoinResult.FULL) {
            router.sendToUser(username, new RoomFull(roomId, "Room is full"));
            return;
        }

        if (result == RoomJoinResult.ALREADY_IN_OTHER_ROOM) {
            router.sendToUser(username, new RoomFull(roomId, "Already in another room"));
            return;
        }

        router.sendToUser(username, new RoomJoined(roomId, membersBeforeJoin));

        for (String member : membersBeforeJoin) {
            if (!member.equals(username)) {
                router.sendToUser(member, new ParticipantJoined(roomId, username));
            }
        }
    }

    public void handleLeave(String username, String roomId) {
        if (roomId == null || roomId.isBlank()) {
            return;
        }
        List<String> membersBeforeLeave = rooms.members(roomId);

        boolean left = rooms.leave(roomId, username);
        if (!left) {
            return;
        }

        releaseScreenShareIfHeld(roomId, username);

        // Room có no ringing/busy/missed semantics — mọi lần 1 participant rời (leave
        // hoặc disconnect, disconnect delegate vào đây) là "completed" cho participant đó.
        metrics.incrementEnded("group", "completed");

        for (String member : membersBeforeLeave) {
            if (!member.equals(username)) {
                router.sendToUser(member, new ParticipantLeft(roomId, username));
            }
        }
    }

    public void handleDecline(String username, String roomId) {
        if (roomId == null || roomId.isBlank()) {
            return;
        }

        List<String> currentMembers = rooms.members(roomId);
        for (String member : currentMembers) {
            if (!member.equals(username)) {
                router.sendToUser(member, new RoomInviteDeclined(roomId, username));
            }
        }
    }

    public void handleDisconnect(String username) {
        String roomId = rooms.roomOf(username);
        if (roomId == null) {
            return;
        }

        handleLeave(username, roomId);
    }

    /** Room hiện tại của username, hoặc null nếu không ở trong room nào (dùng bởi PresenceWebSocketHandler để rẽ nhánh 1-1 CallService path). */
    public String roomOf(String username) {
        return rooms.roomOf(username);
    }

    public boolean claimOrRejectScreenShare(String roomId, String username) {
        return rooms.claimSharer(roomId, username);
    }

    public void releaseScreenShareIfHeld(String roomId, String username) {
        rooms.releaseSharer(roomId, username);
    }
}
