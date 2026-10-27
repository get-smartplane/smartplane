import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"

const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8787"

/** The API worker owns these paths; proxying keeps its session cookie same-origin in dev. */
const proxiedPaths = ["/api", "/auth", "/mcp"] as const

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    cloudflare()
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
  },
  server: {
    proxy: Object.fromEntries(proxiedPaths.map((path) => [path, { target: apiOrigin, changeOrigin: false }]))
  }
})
