-- Script Redis Lua: đếm request theo cửa sổ cố định (fixed window) một cách atomic.
-- Atomic nghĩa là Redis chạy toàn bộ script như một lệnh duy nhất,
-- không request nào khác chen ngang giữa lúc INCR và EXPIRE.

-- key ví dụ: "ratelimit:register:1.2.3.4"
-- Đây là Redis STRING đếm số request trong cửa sổ hiện tại.
local key = KEYS[1]

-- windowSeconds: độ dài cửa sổ tính bằng giây (TTL của key đếm).
local windowSeconds = ARGV[1]

-- INCR tăng bộ đếm; nếu key chưa tồn tại, Redis tự khởi tạo về 0 rồi tăng lên 1.
local count = redis.call('INCR', key)

-- Chỉ đặt TTL ở lần hit ĐẦU TIÊN tạo ra key (count == 1).
-- Nếu EXPIRE mỗi lần gọi thì cửa sổ sẽ trượt (sliding) thay vì cố định (fixed) —
-- ta muốn cửa sổ cố định nên chỉ set TTL một lần khi key mới sinh ra.
if count == 1 then
  redis.call('EXPIRE', key, windowSeconds)
end

-- Trả về số lượt đã dùng trong cửa sổ hiện tại (kể cả lượt này).
return count
