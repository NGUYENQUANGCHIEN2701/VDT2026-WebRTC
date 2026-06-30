-- Script Redis Lua: cho một user rời room một cách atomic.
-- Mục tiêu: xóa user khỏi room, xóa user-room key,
-- và nếu room rỗng thì xóa luôn room key để không còn rác Redis.

-- roomKey ví dụ: "room:abc"
local roomKey = KEYS[1]

-- userRoomKey ví dụ: "user-room:bob"
local userRoomKey = KEYS[2]

-- username: user đang rời room.
local username = ARGV[1]

-- Tách roomId từ roomKey.
-- Ví dụ roomKey = "room:abc", từ ký tự thứ 6 trở đi là "abc".
local roomId = string.sub(roomKey, 6)

-- Xem Redis đang ghi user này thuộc room nào.
local currentRoom = redis.call('GET', userRoomKey)

-- Nếu user-room không trỏ về room này thì không làm gì.
-- Đây là safe leave: gọi leave thừa cũng không phá state.
if currentRoom ~= roomId then
  return 0
end

-- Xóa user khỏi SET room và xóa reverse key user-room:{username}.
redis.call('SREM', roomKey, username)
redis.call('DEL', userRoomKey)

-- Nếu sau khi xóa user mà phòng không còn ai,
-- xóa luôn room:{roomId} để không còn orphan room key.
local size = redis.call('SCARD', roomKey)
if size == 0 then
  redis.call('DEL', roomKey)
end

-- 1 nghĩa là leave thành công.
return 1