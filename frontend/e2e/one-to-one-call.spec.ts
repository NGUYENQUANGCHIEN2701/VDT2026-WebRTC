import { test, expect, request as playwrightRequest, type Browser, type Page } from '@playwright/test'

// Real 1-1 P2P call E2E test: two independent Chromium contexts (fake-media
// devices, per playwright.config.ts) place a real WebRTC call through the
// backend's WebSocket signaling and assert the remote <video> element in
// each context actually receives decoded frames — proving media flowed
// peer-to-peer, not just that signaling completed.

const API_BASE_URL = process.env.E2E_BASE_URL_API ?? 'http://localhost:8080'

interface TestUser {
  username: string
  password: string
  email: string
}

function makeTestUser(role: 'caller' | 'callee'): TestUser {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const username = `e2e-${role}-${suffix}`
  return {
    username,
    password: 'password123',
    email: `${username}@e2e.test`,
  }
}

async function registerUser(user: TestUser): Promise<void> {
  const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL })
  try {
    const res = await api.post('/api/auth/register', { data: user })
    if (!res.ok()) {
      throw new Error(`register failed for ${user.username}: ${res.status()} ${await res.text()}`)
    }
  } finally {
    await api.dispose()
  }
}

async function loginAs(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login')
  await page.locator('input[autocomplete="username"]').fill(user.username)
  await page.locator('input[autocomplete="current-password"]').fill(user.password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/')
}

async function waitForRemoteFrames(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const video = document.querySelector('video[data-testid="remote-video"]') as HTMLVideoElement | null
      return !!video && video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2
    },
    { timeout: 15000 },
  )
}

test('places a real 1-1 call between two fake-media contexts and renders remote video frames', async ({ browser }: { browser: Browser }) => {
  const caller = makeTestUser('caller')
  const callee = makeTestUser('callee')

  await registerUser(caller)
  await registerUser(callee)

  const callerContext = await browser.newContext()
  const calleeContext = await browser.newContext()

  try {
    const callerPage = await callerContext.newPage()
    const calleePage = await calleeContext.newPage()

    await loginAs(callerPage, caller)
    await loginAs(calleePage, callee)

    // Caller waits for the presence WS snapshot to surface the callee's
    // username in the online-users list before the call button is enabled.
    await expect(callerPage.getByText(callee.username, { exact: true })).toBeVisible({ timeout: 15000 })

    const calleeRow = callerPage.locator('li.home-user-row', { hasText: callee.username })
    await calleeRow.locator('button.home-call-btn').click()

    // Callee waits for the incoming-call dialog naming the caller, then accepts.
    const incomingDialog = calleePage.getByRole('dialog', { name: caller.username })
    await expect(incomingDialog).toBeVisible({ timeout: 15000 })
    await calleePage.getByRole('button', { name: 'Nhận cuộc gọi' }).click()

    await expect(callerPage).toHaveURL(/\/call/, { timeout: 15000 })
    await expect(calleePage).toHaveURL(/\/call/, { timeout: 15000 })

    // Core assertion: real media flowed peer-to-peer between the two
    // fake-media contexts — the remote <video> element in each page
    // actually receives decoded frames, not just an attached-but-empty track.
    await waitForRemoteFrames(callerPage)
    await waitForRemoteFrames(calleePage)

    // Clean up so no active call is left dangling in Redis state for subsequent CI runs.
    await callerPage.getByTitle('Kết thúc cuộc gọi / Rời phòng').click()
  } finally {
    await callerContext.close()
    await calleeContext.close()
  }
})
