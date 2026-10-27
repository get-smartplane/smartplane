import { DurableObject } from "cloudflare:workers"
import type { WorkerEnv } from "../platform/bindings"
import { hitWindow, type WindowState } from "./fixed-window"

const isWindowState = (value: unknown): value is WindowState =>
  typeof value === "object" && value !== null && typeof Reflect.get(value, "windowStart") === "number" &&
  typeof Reflect.get(value, "count") === "number"

/**
 * One instance per rate-limited key (a token). A Durable Object runs one request at a time, so the counter
 * is exact across Worker isolates and colos, which a KV counter would not be. Exported as `RateLimiter`.
 */
export class RateLimiterObject extends DurableObject<WorkerEnv> {
  /** Seconds until the caller may retry, or 0 when this hit is allowed (a plain number crosses RPC simply). */
  async hit(limit: number, windowMs: number): Promise<number> {
    const stored: unknown = await this.ctx.storage.get("window")
    const { state, decision } = hitWindow(isWindowState(stored) ? stored : undefined, { limit, windowMs }, Date.now())
    await this.ctx.storage.put("window", state)
    return decision._tag === "Limited" ? decision.retryAfterSeconds : 0
  }
}
