import { Schema } from "effect"
import { OrgId, ProjectId, ResourceId, UserId } from "../ids"
import { Description, Name, Timestamp } from "../primitives"
import { EditableResourceConfig, ResourceConfig, ResourceKind } from "./config"
import { CreateSecretConfig } from "./secret"

/** An MCP server, tool, skill, database, API, secret or variable. `config.kind` is its kind. */
export class Resource extends Schema.Opaque<Resource>()(
  Schema.Struct({
    id: ResourceId,
    orgId: OrgId,
    /** `null` means org-wide; otherwise only visible inside that project. */
    projectId: Schema.NullOr(ProjectId),
    name: Name,
    description: Description,
    config: ResourceConfig,
    createdBy: UserId,
    createdAt: Timestamp,
    updatedAt: Schema.NullOr(Timestamp)
  }).annotate({ identifier: "Resource" })
) {}

export const CreateResourceConfig = Schema.Union([EditableResourceConfig, CreateSecretConfig]).annotate({
  identifier: "CreateResourceConfig"
})
export type CreateResourceConfig = typeof CreateResourceConfig.Type

export const CreateResource = Schema.Struct({
  name: Name,
  description: Description,
  projectId: Schema.NullOr(ProjectId),
  config: CreateResourceConfig
}).annotate({ identifier: "CreateResource" })
export type CreateResource = typeof CreateResource.Type

/** The config's kind must match the stored resource's kind; apps/api rejects a mismatch. */
export const UpdateResource = Schema.Struct({
  name: Schema.optionalKey(Name),
  description: Schema.optionalKey(Description),
  projectId: Schema.optionalKey(Schema.NullOr(ProjectId)),
  config: Schema.optionalKey(EditableResourceConfig)
}).annotate({ identifier: "UpdateResource" })
export type UpdateResource = typeof UpdateResource.Type

export const ResourceFilter = Schema.Struct({
  kind: Schema.optionalKey(ResourceKind),
  projectId: Schema.optionalKey(ProjectId)
})
export type ResourceFilter = typeof ResourceFilter.Type
