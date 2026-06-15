import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,        // dùng describe/it/expect không cần import
    environment: 'jsdom', // giả lập môi trường browser (window, DOM) trong Node
  },
})
