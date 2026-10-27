import { defineConfig } from "vitest/config"

// Pure view logic only (no DOM): what the rule page shows and when it polls.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
})
