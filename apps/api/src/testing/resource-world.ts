import { type Action, type AuditEvent, type GrantSubject, type ProjectId, type Resource, type ResourceConfig, ResourceId } from "@pc/domain"
import { DateTime, Layer } from "effect"
import { Grants } from "../access/grants"
import { GrantsRepo } from "../access/grants-repo"
import { TokensRepo } from "../access/tokens-repo"
import { KvCache } from "../platform/kv"
import { AuditLog } from "../audit/audit-log"
import { IntegrationCatalog } from "../integrations/catalog"
import { Lookup } from "../lookup/lookup"
import { LookupRepo } from "../lookup/lookup-repo"
import { MembersRepo } from "../org/members-repo"
import { ProjectsRepo } from "../org/projects-repo"
import { RolesRepo } from "../org/roles-repo"
import { TeamsRepo } from "../org/teams-repo"
import { Resources } from "../resources/resources"
import { ResourcesRepo } from "../resources/resources-repo"
import { Secrets } from "../secrets/secrets"
import { SecretVersionsRepo } from "../secrets/versions-repo"
import { resourceRow, testBase } from "./connection-harness"
import { now, orgId, userId } from "./fixtures"
import { memoryKv } from "./gateway-fakes"
import { insertRow, memoryAuditQueue } from "./seed"
import { databaseVisibility } from "./visibility"

/** `Resources`, `Grants` and `Lookup` with real visibility over a migrated in-memory D1. */
export const resourceServices = (events: Array<AuditEvent> = [], kv: Layer.Layer<KvCache> = memoryKv()) =>
  Layer.mergeAll(Resources.layer, Grants.layer, Lookup.layer).pipe(
    Layer.provideMerge(databaseVisibility),
    Layer.provideMerge(Layer.mergeAll(Secrets.layer, IntegrationCatalog.layer, LookupRepo.layer)),
    Layer.provideMerge(Layer.mergeAll(
      ResourcesRepo.layer,
      ProjectsRepo.layer,
      SecretVersionsRepo.layer,
      GrantsRepo.layer,
      MembersRepo.layer,
      TeamsRepo.layer,
      RolesRepo.layer,
      TokensRepo.layer,
      AuditLog.layer.pipe(Layer.provide(memoryAuditQueue(events))),
      kv
    )),
    Layer.provideMerge(testBase)
  )

export const storedResource = (id: string, config: ResourceConfig, projectId: ProjectId | null = null): Resource => ({
  id: ResourceId.make(id),
  orgId,
  projectId,
  name: id,
  description: "",
  config,
  createdBy: userId,
  createdAt: now,
  updatedAt: null
})

export const storeResource = (resource: Resource) =>
  resource.projectId === null
    ? resourceRow(resource)
    : insertRow("resources", {
      id: resource.id,
      orgId,
      projectId: resource.projectId,
      kind: resource.config.kind,
      name: resource.name,
      description: "",
      config: JSON.stringify(resource.config),
      createdBy: userId,
      createdAt: DateTime.formatIso(now)
    })

/** A grant row for any subject kind; `expiresAt` in the past makes it expired. */
export const storeGrant = (id: string, resourceId: ResourceId, subject: GrantSubject, options: { action?: Action; expiresAt?: DateTime.Utc } = {}) =>
  insertRow("grants", {
    id,
    orgId,
    subject: JSON.stringify(subject),
    subjectType: subject.type,
    subjectId: subject.type === "role" ? subject.role : subject.id,
    resourceId,
    action: options.action ?? "use",
    conditions: "{}",
    expiresAt: options.expiresAt === undefined ? null : DateTime.formatIso(options.expiresAt),
    createdBy: userId,
    createdAt: DateTime.formatIso(now)
  })
