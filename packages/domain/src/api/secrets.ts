import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Forbidden } from "../errors"
import { KeyRewrapResult } from "../resources/key-rotation"
import { SecretStatus } from "../resources/secret"
import { Authentication } from "./security"

/** Secret metadata and key management; never returns or accepts secret values. */
export class SecretsApi extends HttpApiGroup.make("secrets")
  .add(
    /** Current version and its time of each live secret the caller can see (all with `resources:manage`; else deliverable ones they may receive). */
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(SecretStatus), error: Forbidden }),
    /** Re-wraps this org's secret data keys under the current KEK (one bounded batch per call). Requires `org:manage`. */
    HttpApiEndpoint.post("rewrap", "/rewrap", { success: KeyRewrapResult, error: Forbidden })
  )
  .middleware(Authentication)
  .prefix("/secrets")
{}
