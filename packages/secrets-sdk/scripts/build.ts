/**
 * Builds @smartplane/secrets with `bun build`: ESM in dist/, CommonJS in dist/cjs/ (marked "type": "commonjs"
 * so Node and TypeScript read it, and its declarations, as CJS). Declarations come from tsc. There are no
 * runtime dependencies to bundle. Usage: bun run scripts/build.ts
 */
import { $ } from "bun"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { gzipSync } from "node:zlib"

await rm("dist", { recursive: true, force: true })
const outputs = [["esm", "dist"], ["cjs", "dist/cjs"]] as const
for (const [format, outdir] of outputs) {
  const result = await Bun.build({ entrypoints: ["src/index.ts"], outdir, naming: "index.js", format, target: "browser" })
  if (!result.success) throw new AggregateError(result.logs, `bun build (${format}) failed`)
}
await $`bunx tsc -p tsconfig.build.json`.quiet()
await mkdir("dist/cjs", { recursive: true })
for (const file of ["index", "cache", "errors", "load", "request", "response"]) await cp(`dist/${file}.d.ts`, `dist/cjs/${file}.d.ts`)
await writeFile("dist/cjs/package.json", `${JSON.stringify({ type: "commonjs" })}\n`)

for (const file of ["dist/index.js", "dist/cjs/index.js"]) {
  const bytes = await readFile(file)
  console.log(`${file}: ${(bytes.length / 1024).toFixed(1)} KiB, ${(gzipSync(bytes).length / 1024).toFixed(1)} KiB gzipped`)
}
