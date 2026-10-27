import type { IntegrationsRpc } from "@pc/integrations/rpc"
import { Context } from "effect"
import type { AuditLogObject } from "../audit/durable-object"
import type { RateLimiterObject } from "../delivery/rate-limit-object"

/** Cloudflare bindings declared in wrangler.jsonc. Only platform layers read these. */
export interface Bindings {
  readonly DB: D1Database
  readonly CACHE: KVNamespace
  readonly AUDIT_ARCHIVE: R2Bucket
  readonly AUDIT_QUEUE: Queue
  readonly AUDIT_LOG: DurableObjectNamespace<AuditLogObject>
  /** One rate-limit counter per token for secret delivery. */
  readonly RATE_LIMITER: DurableObjectNamespace<RateLimiterObject>
  readonly AI: Ai
  /** Skill bundle files, content-addressed per org (`skills/<orgId>/<sha256>`). */
  readonly SKILLS: R2Bucket
  /** Producer of `skill-scans`; only used while `SKILL_SCANNING` is on. */
  readonly SKILL_SCANS: Queue
  /** Producer of `guard-self-tests`: verify runs (every stage, from finding targets to the self-test) run in its consumer. */
  readonly GUARD_SELF_TESTS: Queue
  /** Service binding to smartplane-integrations (apps/integrations, shard `core`). Optional: without it, that shard's pieces offer no tools. */
  readonly INTEGRATIONS?: IntegrationsRpc
  /** Service binding to smartplane-integrations-business (shard `business`: Microsoft 365, ERP, CRM). Optional like `INTEGRATIONS`. */
  readonly INTEGRATIONS_BUSINESS?: IntegrationsRpc
}

/** The Worker `env`: bindings plus vars and secrets, which are decoded by `AppConfig`. */
export type WorkerEnv = Bindings & Readonly<Record<string, unknown>>

export class WorkerBindings extends Context.Service<WorkerBindings, Bindings>()("api/platform/WorkerBindings") {}
