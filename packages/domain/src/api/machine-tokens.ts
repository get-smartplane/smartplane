import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { CreatedMachineToken, CreateMachineToken, MachineToken, RenewMachineToken } from "../access/machine-token"
import { Forbidden, InvalidInput, NotFound } from "../errors"
import { MachineTokenId } from "../ids"
import { Authentication } from "./security"

const params = { id: MachineTokenId }

/**
 * Machine tokens for deployed services. Listing needs `tokens:manage` or `reviews:manage`; creating and
 * renewing need `tokens:manage` and `resources:manage`; revoking needs `tokens:manage` or `reviews:manage`.
 * A machine token itself is refused here, like on every endpoint but `/secrets/deliver`.
 */
export class MachineTokensApi extends HttpApiGroup.make("machineTokens")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(MachineToken), error: Forbidden }),
    HttpApiEndpoint.post("create", "/", {
      payload: CreateMachineToken,
      success: CreatedMachineToken.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, NotFound, InvalidInput]
    }),
    HttpApiEndpoint.post("renew", "/:id/renew", { params, payload: RenewMachineToken, success: MachineToken, error: [Forbidden, NotFound] }),
    HttpApiEndpoint.delete("revoke", "/:id", { params, error: [Forbidden, NotFound] })
  )
  .middleware(Authentication)
  .prefix("/machine-tokens")
{}
