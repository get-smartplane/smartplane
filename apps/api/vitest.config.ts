import { defineConfig } from "vitest/config"

/** Mirrors wrangler's `Text` rule for `*.md`: built-in skills import their SKILL.md as a string. */
const markdownAsText = {
  name: "markdown-as-text",
  transform: (code: string, id: string) => (id.endsWith(".md") ? { code: `export default ${JSON.stringify(code)}`, map: null } : undefined)
}

// Tests exercise pure logic and services over in-memory fakes, so they run in plain Node, not workerd.
export default defineConfig({
  plugins: [markdownAsText],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
})
