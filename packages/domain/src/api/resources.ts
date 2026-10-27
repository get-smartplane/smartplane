import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Conflict, Forbidden, InvalidInput, NotFound, UpstreamFailure } from "../errors"
import { ResourceId } from "../ids"
import { CreateResource, Resource, ResourceFilter, UpdateResource } from "../resources/resource"
import { RotateSecret, SecretRotated } from "../resources/secret"
import { ResourceTools } from "../resources/upstream-tools"
import { Authentication } from "./security"

const params = { id: ResourceId }

export class ResourcesApi extends HttpApiGroup.make("resources")
  .add(
    HttpApiEndpoint.get("list", "/", { query: ResourceFilter, success: Schema.Array(Resource), error: Forbidden }),
    HttpApiEndpoint.get("get", "/:id", { params, success: Resource, error: [Forbidden, NotFound] }),
    /** GitHub and link skills are fetched on creation, so their source can fail upstream. */
    HttpApiEndpoint.post("create", "/", {
      payload: CreateResource,
      success: Resource.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, NotFound, Conflict, InvalidInput, UpstreamFailure]
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params,
      payload: UpdateResource,
      success: Resource,
      error: [Forbidden, NotFound, Conflict, InvalidInput]
    }),
    /** Soft delete; also revokes every grant on the resource. */
    HttpApiEndpoint.delete("remove", "/:id", { params, error: [Forbidden, NotFound] }),
    /**
     * An MCP server's tools from its cached upstream listing, with read/write hints from their annotations.
     * `resources:manage` sees every tool; a member with a grant sees the tools their grants allow.
     */
    HttpApiEndpoint.get("tools", "/:id/tools", { params, success: ResourceTools, error: [Forbidden, NotFound, InvalidInput] }),
    HttpApiEndpoint.post("rotateSecret", "/:id/rotate", {
      params,
      payload: RotateSecret,
      success: SecretRotated,
      error: [Forbidden, NotFound, InvalidInput]
    })
  )
  .middleware(Authentication)
  .prefix("/resources")
{}
