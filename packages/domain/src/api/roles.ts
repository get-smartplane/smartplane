import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Conflict, Forbidden, NotFound } from "../errors"
import { RoleSlug } from "../ids"
import { CreateRole, Role, UpdateRole } from "../org/role"
import { Authentication } from "./security"

const params = { slug: RoleSlug }

/** Builtin roles are listed but cannot be changed; deleting a role still assigned to members is a Conflict. */
export class RolesApi extends HttpApiGroup.make("roles")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Role) }),
    HttpApiEndpoint.post("create", "/", {
      payload: CreateRole,
      success: Role.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, Conflict]
    }),
    HttpApiEndpoint.patch("update", "/:slug", {
      params,
      payload: UpdateRole,
      success: Role,
      error: [Forbidden, NotFound, Conflict]
    }),
    HttpApiEndpoint.delete("remove", "/:slug", { params, error: [Forbidden, NotFound, Conflict] })
  )
  .middleware(Authentication)
  .prefix("/roles")
{}
