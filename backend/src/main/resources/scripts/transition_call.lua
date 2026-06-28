-- transition_call.lua — CAS một chuyển trạng thái cuộc gọi, chạy nguyên khối (atomic)
-- KEYS[1] = call:{callId}
-- KEYS[2] = user-call:{callerId}   ("" nếu không muốn dọn con trỏ này)
-- KEYS[3] = user-call:{calleeId}   ("" nếu không muốn dọn con trỏ này)
-- ARGV[1] = state kỳ vọng (vd "ringing")
-- ARGV[2] = state mới     (vd "active")
-- ARGV[3] = reason        (vd "completed"; "" nếu chưa kết thúc)
-- ARGV[4] = now epoch-ms  (đóng dấu activeAt/endedAt)
-- ARGV[5] = TTL giây cho cuộc active (gia hạn khỏi ring-TTL)
-- Trả: 1 = thành công · 0 = state hiện tại không khớp (caller thua race / transition không hợp lệ)

-- Bước 1: đọc state hiện tại của bản ghi cuộc gọi
local current = redis.call('HGET', KEYS[1], 'state')

-- Bước 2: CAS guard. Nếu state hiện tại KHÁC cái mình kỳ vọng → thua/không hợp lệ → bỏ ngay.
if current ~= ARGV[1] then
    return 0
end

-- Bước 3: state khớp → ghi state mới
redis.call('HSET', KEYS[1], 'state', ARGV[2])

-- Bước 4: nếu có reason (chuỗi rỗng "" nghĩa là chưa kết thúc) thì ghi reason
if ARGV[3] ~= '' then
    redis.call('HSET', KEYS[1], 'reason', ARGV[3])
end

-- Bước 5: vào active → đóng dấu thời điểm
if ARGV[2] == 'active' then
    redis.call('HSET', KEYS[1], 'activeAt', ARGV[4])
    -- ARGV[5] = TTL giây cho cuộc đang nói. Gia hạn cả hash lẫn 2 con trỏ user-call.
    redis.call('EXPIRE', KEYS[1], ARGV[5])
    if KEYS[2] ~= '' then redis.call('EXPIRE', KEYS[2], ARGV[5]) end
    if KEYS[3] ~= '' then redis.call('EXPIRE', KEYS[3], ARGV[5]) end
end


-- Bước 6: kết thúc → đóng dấu endedAt + dọn 2 con trỏ user-call (nếu được truyền)
if ARGV[2] == 'ended' then
    redis.call('HSET', KEYS[1], 'endedAt', ARGV[4])
    if KEYS[2] ~= '' then redis.call('DEL', KEYS[2]) end
    if KEYS[3] ~= '' then redis.call('DEL', KEYS[3]) end
end

-- Bước 7: báo thành công
return 1
