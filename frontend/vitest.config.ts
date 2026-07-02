import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,        // dùng describe/it/expect không cần import
    environment: 'jsdom', // giả lập môi trường browser (window, DOM) trong Node
    // Loại trừ Playwright E2E specs (frontend/e2e/**) khỏi Vitest — chúng dùng
    // @playwright/test's test(), không tương thích với Vitest runner (Plan 09-05 fix).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
