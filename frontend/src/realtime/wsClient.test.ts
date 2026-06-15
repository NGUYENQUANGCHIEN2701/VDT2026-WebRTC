import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// wsClient.ts CHƯA tồn tại → import này fail → test ĐỎ (đúng baseline Wave 0)
import { connectWs, disconnectWs } from './wsClient'

// ── Giả lập WebSocket (browser thật có sẵn; test phải tự dựng) ──
class MockWebSocket {
  static instances: MockWebSocket[] = []   // ghi lại mọi kết nối được tạo
  url: string
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }
  send(data: string) { this.sent.push(data) }
  close() { this.onclose?.() }
  // helper cho test: giả lập server gửi 1 message xuống
  receive(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }) }
}

// ── Giả lập 2 store (chưa cần store thật) ──
// vi.hoisted: spy được "nhấc" lên cùng vi.mock → factory thấy được, import để đầu file
const { setOnline, setKicked } = vi.hoisted(() => ({
  setOnline: vi.fn(),
  setKicked: vi.fn(),
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: { getState: () => ({ token: 'fake-jwt' }) },
}))
vi.mock('../store/presenceStore', () => ({
  usePresenceStore: { getState: () => ({ setOnline, setKicked }) },
}))

beforeEach(() => {
  MockWebSocket.instances = []
  setOnline.mockClear()
  setKicked.mockClear()
  vi.stubGlobal('WebSocket', MockWebSocket)            // thay WebSocket thật bằng mock
  vi.stubEnv('VITE_WS_URL', 'ws://localhost:8080/ws')
  vi.useFakeTimers()                                    // điều khiển thời gian (cho backoff)
})

afterEach(() => {
  disconnectWs()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('wsClient', () => {
  it('áp snapshot presence vào store', () => {
    connectWs()
    MockWebSocket.instances[0].receive({
      type: 'presence',
      users: [{ username: 'alice', status: 'ONLINE' }],
    })
    expect(setOnline).toHaveBeenCalledWith([{ username: 'alice', status: 'ONLINE' }])
  })

  it('session-superseded → set kicked, KHÔNG reconnect', () => {
    connectWs()
    const ws = MockWebSocket.instances[0]
    ws.receive({ type: 'session-superseded', reason: 'elsewhere' })
    expect(setKicked).toHaveBeenCalledWith(true)
    ws.close()
    vi.advanceTimersByTime(10000)
    expect(MockWebSocket.instances).toHaveLength(1)     // không tạo kết nối mới
  })

  it('close bất ngờ → reconnect có backoff', () => {
    connectWs()
    MockWebSocket.instances[0].close()                  // đóng ngoài ý muốn (không bị kick)
    vi.advanceTimersByTime(5000)
    expect(MockWebSocket.instances.length).toBeGreaterThan(1)  // đã reconnect
  })
})
