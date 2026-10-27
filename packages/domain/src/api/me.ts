import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Org } from "../org/org"
import { Principal } from "../principal"
import { Authentication } from "./security"

export class Me extends Schema.Opaque<Me>()(
  Schema.Struct({ principal: Principal, org: Org }).annotate({ identifier: "Me" })
) {}

export class MeApi extends HttpApiGroup.make("me")
  .add(HttpApiEndpoint.get("get", "/", { success: Me }))
  .middleware(Authentication)
  .prefix("/me")
{}
