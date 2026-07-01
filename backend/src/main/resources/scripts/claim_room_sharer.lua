-- Script Redis Lua: cho một user claim quyền "đang chia sẻ màn hình" (sharer)
-- trong room một cách atomic. Atomic nghĩa là Redis chạy toàn bộ script như
-- một lệnh duy nhất, không request nào khác chen ngang giữa lúc đang check
-- và set giá trị.

-- sharerKey ví dụ: "room-sharer:abc"
-- Đây là Redis STRING ghi username của người đang giữ quyền chia sẻ màn hình
-- trong room abc.
local sharerKey = KEYS[1]

-- username: user đang muốn claim quyền chia sẻ màn hình.
local username = ARGV[1]

-- ttlSeconds: thời gian sống của key, tự dọn nếu release bị bỏ sót (crash...).
local ttlSeconds = tonumber(ARGV[2])

-- Xem hiện tại ai đang giữ khóa sharer của room này.
local currentSharer = redis.call('GET', sharerKey)

-- Nếu chưa ai giữ khóa, hoặc chính user này đang giữ (idempotent re-claim,
-- ví dụ gửi lại media-state khi vẫn đang share), thì cho claim/refresh TTL.
if currentSharer == false or currentSharer == username then
  redis.call('SET', sharerKey, username, 'EX', ttlSeconds)
  return 1
end

-- Có người khác đang giữ khóa → từ chối claim.
return 0
