import { defineConfig } from "vitest/config"

// Commands run against in-memory fakes of the API and a temp HOME, in plain Node.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
})
