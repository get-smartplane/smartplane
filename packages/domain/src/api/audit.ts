import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { DeliverySummary } from "../audit/delivery-summary"
import { AuditExportQuery, AuditPage, AuditQuery, AuditVerifyQuery, ChainVerification } from "../audit/query"
import { Forbidden, InvalidInput } from "../errors"
import { Authentication } from "./security"

/** Newline-delimited `ChainedAuditEvent` JSON, one event per line, in `seq` order. */
export const AuditExport = Schema.String.pipe(HttpApiSchema.asText({ contentType: "application/x-ndjson" }))

/** Every endpoint requires `audit:read`. */
export class AuditApi extends HttpApiGroup.make("audit")
  .add(
    HttpApiEndpoint.get("list", "/", { query: AuditQuery, success: AuditPage, error: Forbidden }),
    /** Per-resource `secret.delivered` counts and the latest recipient, in one call for the Secrets page. */
    HttpApiEndpoint.get("deliveries", "/deliveries", { success: Schema.Array(DeliverySummary), error: Forbidden }),
    HttpApiEndpoint.get("verify", "/verify", { query: AuditVerifyQuery, success: ChainVerification, error: Forbidden }),
    HttpApiEndpoint.get("export", "/export", {
      query: AuditExportQuery,
      success: AuditExport,
      error: [Forbidden, InvalidInput]
    })
  )
  .middleware(Authentication)
  .prefix("/audit")
{}
