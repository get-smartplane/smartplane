import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Forbidden } from "../errors"
import { LookupRequest, LookupResult } from "../lookup"
import { Authentication } from "./security"

/**
 * Display names for ids the dashboard shows (audit actors and targets, approval requesters and guards, grant
 * subjects, review items). One batched call per screen; requires `resources:read`, scoped to the caller's org.
 */
export class LookupApi extends HttpApiGroup.make("lookup")
  .add(HttpApiEndpoint.post("resolve", "/", { payload: LookupRequest, success: LookupResult, error: Forbidden }))
  .middleware(Authentication)
  .prefix("/lookup")
{}
