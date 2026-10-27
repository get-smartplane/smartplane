import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { CreateGrant, Grant, GrantFilter } from "../access/grant"
import { Forbidden, InvalidInput, NotFound } from "../errors"
import { GrantId } from "../ids"
import { Authentication } from "./security"

/** Lists active grants only; revoked grants remain visible in the audit log. */
export class GrantsApi extends HttpApiGroup.make("grants")
  .add(
    HttpApiEndpoint.get("list", "/", { query: GrantFilter, success: Schema.Array(Grant), error: Forbidden }),
    HttpApiEndpoint.post("create", "/", {
      payload: CreateGrant,
      success: Grant.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, NotFound, InvalidInput]
    }),
    HttpApiEndpoint.delete("revoke", "/:id", { params: { id: GrantId }, error: [Forbidden, NotFound] })
  )
  .middleware(Authentication)
  .prefix("/grants")
{}
