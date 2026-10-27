import { defineConfig } from "vitest/config"

// Tests exercise pure logic and services over in-memory fakes, so they run in plain Node, not workerd.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
})
