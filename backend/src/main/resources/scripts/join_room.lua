-- Script Redis Lua: cho một user join vào room một cách atomic.
-- Atomic nghĩa là Redis chạy toàn bộ script như một lệnh duy nhất,
-- không request nào khác chen ngang giữa lúc đang check size và add user.

-- roomKey ví dụ: "room:abc"
-- Đây là Redis SET chứa danh sách user trong phòng abc.
local roomKey = KEYS[1]

-- userRoomKey ví dụ: "user-room:bob"
-- Đây là Redis STRING ghi Bob hiện đang ở room nào.
local userRoomKey = KEYS[2]

-- username: user đang muốn join room.
local username = ARGV[1]

-- roomId: id của room muốn join.
local roomId = ARGV[2]

-- maxMembers: số người tối đa trong phòng, Phase 7 là 4.
local maxMembers = tonumber(ARGV[3])

-- ttlSeconds: thời gian sống của key, giúp Redis tự dọn nếu cleanup bị lỗi.
local ttlSeconds = tonumber(ARGV[4])

-- Kiểm tra user này hiện đang ở room nào chưa.
local currentRoom = redis.call('GET', userRoomKey)

-- Nếu user đã ở đúng room này rồi thì join lại vẫn coi là thành công.
-- Đây gọi là idempotent: gọi lại nhiều lần không làm sai state.
if currentRoom == roomId then
  redis.call('EXPIRE', roomKey, ttlSeconds)
  redis.call('EXPIRE', userRoomKey, ttlSeconds)
  return 1
end

-- Nếu user đang ở room khác thì không cho join room mới.
if currentRoom then
  return -2
end

-- SCARD đếm số member hiện có trong SET room.
-- Nếu phòng đã đủ maxMembers thì trả về room full.
local size = redis.call('SCARD', roomKey)
if size >= maxMembers then
  return -1
end

-- Còn chỗ trong phòng:
-- 1. Thêm user vào SET room.
-- 2. Ghi user-room:{username} -> roomId để biết user đang ở phòng nào.
-- 3. Refresh TTL cho cả room key và user-room key.
redis.call('SADD', roomKey, username)
redis.call('SET', userRoomKey, roomId)
redis.call('EXPIRE', roomKey, ttlSeconds)
redis.call('EXPIRE', userRoomKey, ttlSeconds)

-- 1 nghĩa là join thành công.
return 1