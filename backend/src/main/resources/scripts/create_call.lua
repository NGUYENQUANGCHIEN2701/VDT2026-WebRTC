-- create_call.lua — tạo cuộc gọi mới (ringing) nguyên khối: check busy + phát hiện glare
-- KEYS[1] = call:{callId}          -- bản ghi cuộc gọi MỚI
-- KEYS[2] = user-call:{callerId}
-- KEYS[3] = user-call:{calleeId}
-- ARGV[1] = callerId
-- ARGV[2] = calleeId
-- ARGV[3] = callId
-- ARGV[4] = now epoch-ms
-- ARGV[5] = ttl giây (vd "300")
-- Trả:  1 = tạo OK (ringing) · -1 = BUSY · -2 = GLARE (Java quyết lower-userId-wins)

-- Bước 1: callee có đang trong cuộc nào không? (GET key thiếu → false)
local calleeCall = redis.call('GET', KEYS[3])

-- Bước 2: callee đang bận → phân biệt glare vs busy thật
if calleeCall then
    -- đọc 2 đầu của cuộc mà callee đang dính ('call:' .. id ghép thành key)
    local exCaller = redis.call('HGET', 'call:' .. calleeCall, 'callerId')
    local exCallee = redis.call('HGET', 'call:' .. calleeCall, 'calleeId')
    -- cuộc đó là callee đang gọi NGƯỢC lại caller? → glare, không phải busy
    if exCaller == ARGV[2] and exCallee == ARGV[1] then
        return -2
    end
    -- callee đang bận với người thứ ba → busy thật
    return -1
end

-- Bước 3: phòng thủ — caller cũng đang kẹt một cuộc khác?
if redis.call('EXISTS', KEYS[2]) == 1 then
    return -1
end

-- Bước 4: sạch → tạo bản ghi ringing + 2 con trỏ busy + TTL an toàn
redis.call('HSET', KEYS[1],
    'state', 'ringing',
    'callerId', ARGV[1],
    'calleeId', ARGV[2],
    'createdAt', ARGV[4])
redis.call('SET', KEYS[2], ARGV[3])
redis.call('SET', KEYS[3], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[5])
redis.call('EXPIRE', KEYS[2], ARGV[5])
redis.call('EXPIRE', KEYS[3], ARGV[5])

-- Bước 5: báo tạo thành công
return 1
