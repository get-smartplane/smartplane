import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { AccessToken, AccessTokenFilter, CreateAccessToken, CreatedAccessToken } from "../access/token"
import { Forbidden, NotFound } from "../errors"
import { AccessTokenId } from "../ids"
import { Authentication } from "./security"

/** Anyone may manage their own personal tokens; service accounts and `scope=all` need `tokens:manage`. */
export class TokensApi extends HttpApiGroup.make("tokens")
  .add(
    HttpApiEndpoint.get("list", "/", { query: AccessTokenFilter, success: Schema.Array(AccessToken), error: Forbidden }),
    HttpApiEndpoint.post("create", "/", {
      payload: CreateAccessToken,
      success: CreatedAccessToken.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, NotFound]
    }),
    HttpApiEndpoint.delete("revoke", "/:id", { params: { id: AccessTokenId }, error: [Forbidden, NotFound] })
  )
  .middleware(Authentication)
  .prefix("/tokens")
{}
