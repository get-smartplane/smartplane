/**
 * Builds the CLI two ways:
 * - single-file executables per platform (`bun build --compile`), for GitHub releases and curl installs;
 * - a Node-compatible bundle in dist/npm, published to npm as `smartplane` (`npx smartplane`, `bunx smartplane`).
 * Usage: bun run scripts/build.ts [--npm-only] [--target linux-x64 ...]
 */
import { $ } from "bun"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { version } from "../package.json"

const targets = ["linux-x64", "linux-arm64", "darwin-arm64", "darwin-x64", "windows-x64"] as const
type Target = (typeof targets)[number]

const args = process.argv.slice(2)
const npmOnly = args.includes("--npm-only")
const picked = args.flatMap((arg, index) => (args[index - 1] === "--target" ? [arg] : []))
const selected = picked.length > 0 ? targets.filter((target) => picked.includes(target)) : targets

const compile = async (target: Target) => {
  const outfile = `dist/bin/smartplane-${target}${target.startsWith("windows") ? ".exe" : ""}`
  await $`bun build src/bin.ts --compile --minify --target=bun-${target} --outfile ${outfile}`.quiet()
  console.log(`built ${outfile}`)
}

/** The npm package is the bundle alone: no dependencies to install, nothing from the workspace leaks in. */
const npm = async () => {
  await rm("dist/npm", { recursive: true, force: true })
  await $`bun build src/bin.ts --target=node --minify --outfile dist/npm/smartplane.js`.quiet()
  const manifest = {
    name: "smartplane",
    version,
    description: "Command-line tool for Smartplane, the access control plane for AI agents",
    license: "FSL-1.1-ALv2",
    homepage: "https://app.smartplane.dev",
    repository: { type: "git", url: "git+https://github.com/get-smartplane/smartplane.git", directory: "apps/cli" },
    type: "module",
    bin: { smartplane: "smartplane.js" },
    files: ["smartplane.js", "README.md", "LICENSE.md"],
    engines: { node: ">=20" }
  }
  await writeFile("dist/npm/package.json", `${JSON.stringify(manifest, null, 2)}\n`)
  await $`cp ../../docs/cli.md dist/npm/README.md`.quiet()
  await $`cp ../../LICENSE.md dist/npm/LICENSE.md`.quiet()
  console.log("built dist/npm (publish with: cd dist/npm && npm publish)")
}

await mkdir("dist/bin", { recursive: true })
await npm()
if (!npmOnly) for (const target of selected) await compile(target)
