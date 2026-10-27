/**
 * Writes the production Wrangler config beside each Worker's committed one by applying the production overlay:
 * Worker names, resource ids and names, routes and vars that do not belong in the public repository.
 *
 * The overlay comes from SMARTPLANE_PRODUCTION_OVERLAY (CI) or the gitignored deploy/production.json (laptop);
 * its shape is deploy/production.example.json. Usage: bun run --filter @pc/deploy production-config
 */
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { assertIsolated } from "./isolation"
import { applyOverlay, configPaths, decodeOverlay, type Worker } from "./overlay"

const root = join(import.meta.dir, "../../..")

const loadOverlay = async (): Promise<unknown> => {
  const inline = process.env["SMARTPLANE_PRODUCTION_OVERLAY"]
  if (inline !== undefined && inline.trim() !== "") return JSON.parse(inline)
  const text = await readFile(join(root, "deploy/production.json"), "utf8").catch(() => undefined)
  if (text === undefined) throw new Error("No production overlay: set SMARTPLANE_PRODUCTION_OVERLAY or create deploy/production.json")
  return JSON.parse(text)
}

export const productionPath = (path: string): string => path.replace(/\.jsonc$/, ".production.json")

const overlay = decodeOverlay(await loadOverlay())
assertIsolated(overlay)

for (const [worker, path] of Object.entries(configPaths) as Array<[Worker, string]>) {
  const base: unknown = Bun.JSONC.parse(await readFile(join(root, path), "utf8"))
  const config = applyOverlay(worker, base, overlay.workers[worker])
  await writeFile(join(root, productionPath(path)), `${JSON.stringify(config, null, 2)}\n`)
  console.log(`${path} → ${productionPath(path)}`)
}
