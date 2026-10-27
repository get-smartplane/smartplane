import { type AuditEvent, type Resource, ResourceId } from "@pc/domain"
import { DateTime, Effect, Layer, Redacted } from "effect"
import { FetchHttpClient } from "effect/http"
import type { SqlClient } from "effect/sql"
import type { D1Client } from "@effect/sql-d1"
import { AccessPolicy } from "../access/access-policy"
import { GrantsRepo } from "../access/grants-repo"
import { AuditLog } from "../audit/audit-log"
import { Connections } from "../connections/connections"
import { ConnectionsRepo } from "../connections/connections-repo"
import { ConnectionsCoreLive } from "../connections/live"
import { IntegrationCatalog } from "../integrations/catalog"
import { IntegrationOAuth } from "../integrations/oauth/flow"
import { OAuthStates } from "../integrations/oauth/state-store"
import { TokenEndpoint } from "../integrations/oauth/token-endpoint"
import { ProjectsRepo } from "../org/projects-repo"
import { AppConfig } from "../platform/config"
import { toBase64 } from "../platform/encoding"
import { SingleUseStore } from "../platform/single-use-states"
import { ResourceVisibility } from "../resources/resource-visibility"
import { ResourcesRepo } from "../resources/resources-repo"
import { importKek } from "../secrets/envelope"
import { KeyRing } from "../secrets/key-ring"
import { Secrets } from "../secrets/secrets"
import { SecretVersionsRepo } from "../secrets/versions-repo"
import { testConfig } from "./config"
import { TestDatabase } from "./database"
import { now, orgId, userId } from "./fixtures"
import { memoryKv } from "./gateway-fakes"
import { insertRow, memoryAuditQueue } from "./seed"

const randomKek = Layer.effect(KeyRing, Effect.map(
  importKek("kek-test", Redacted.make(toBase64(crypto.getRandomValues(new Uint8Array(32))))).pipe(Effect.orDie),
  (kek) => KeyRing.make(kek)
))

/** A migrated in-memory D1, a random KEK and the test config; a smoke script may pass its own instead. */
export const testBase = Layer.mergeAll(TestDatabase, randomKek, Layer.succeed(AppConfig, testConfig))

/**
 * The connections feature over a migrated in-memory D1, a random KEK, in-memory KV and audit, and `fetch`
 * answered by `fetch` (fake authorization and MCP servers): everything real except the network.
 */
export const connectionServices = (
  fetch: typeof globalThis.fetch,
  events: Array<AuditEvent>,
  base: Layer.Layer<D1Client.D1Client | SqlClient.SqlClient | KeyRing | AppConfig, Layer.Error<typeof testBase>> = testBase
) =>
  Connections.layer.pipe(
    Layer.provideMerge(ConnectionsCoreLive),
    Layer.provideMerge(ResourceVisibility.layer),
    Layer.provideMerge(Layer.mergeAll(IntegrationOAuth.layer, AccessPolicy.layer)),
    Layer.provideMerge(Layer.mergeAll(Secrets.layer, TokenEndpoint.layer, OAuthStates.layer, IntegrationCatalog.layer)),
    Layer.provideMerge(Layer.mergeAll(
      ResourcesRepo.layer,
      ConnectionsRepo.layer,
      SecretVersionsRepo.layer,
      GrantsRepo.layer,
      ProjectsRepo.layer,
      AuditLog.layer.pipe(Layer.provide(memoryAuditQueue(events))),
      memoryKv(),
      SingleUseStore.layer,
      FetchHttpClient.layer
    )),
    Layer.provideMerge(Layer.mergeAll(base, Layer.succeed(FetchHttpClient.Fetch, fetch)))
  )

export const resourceRow = (resource: Resource) =>
  insertRow("resources", {
    id: resource.id,
    orgId: resource.orgId,
    kind: resource.config.kind,
    name: resource.name,
    description: resource.description,
    config: JSON.stringify(resource.config),
    createdBy: resource.createdBy,
    createdAt: DateTime.formatIso(now)
  })

export const grantRow = (id: string, resourceId: ResourceId, subjectId: string, action = "use") =>
  insertRow("grants", {
    id,
    orgId,
    subject: JSON.stringify({ type: "user", id: subjectId }),
    subjectType: "user",
    subjectId,
    resourceId,
    action,
    conditions: "{}",
    createdBy: userId,
    createdAt: DateTime.formatIso(now)
  })
