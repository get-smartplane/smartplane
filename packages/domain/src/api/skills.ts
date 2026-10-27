import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Conflict, Forbidden, InvalidInput, NotFound, UpstreamFailure } from "../errors"
import { ResourceId } from "../ids"
import { PositiveInt } from "../primitives"
import { BuiltinSkillSummary } from "../skills/builtin"
import { CreateSkill, OverrideScan, SkillCreated, UploadSkillQuery, UploadVersionQuery } from "../skills/input"
import { SkillScanning, SkillScanPolicy } from "../skills/scan"
import { SkillUpdateCheck, SkillVersion, SkillVersionDetail } from "../skills/version"
import { Authentication } from "./security"

const params = { id: ResourceId }
const versionParams = { id: ResourceId, version: PositiveInt }

/** A .zip or .tar.gz of a skill folder. Sent raw, or as the `file` field of a multipart form. */
export const SkillArchive = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: "application/octet-stream" }))

/** A version's files as a .tar.gz, paths relative to the skill root. */
export const SkillBundle = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: "application/gzip" }))

const fetchErrors = [Forbidden, NotFound, Conflict, InvalidInput, UpstreamFailure]

/**
 * Skill bundles: folders with SKILL.md, fetched from GitHub or a link, or uploaded, kept as immutable
 * versions. Writes need `resources:manage`; the scan policy needs `org:manage`; downloading a bundle
 * needs a `read` grant on the skill, exactly like the MCP gateway.
 */
export class SkillsApi extends HttpApiGroup.make("skills")
  .add(
    HttpApiEndpoint.get("scanning", "/scanning", { success: SkillScanning, error: Forbidden }),
    /** Skills shipped with Smartplane (served to everyone, read-only); any signed-in member may list them. */
    HttpApiEndpoint.get("builtin", "/builtin", { success: Schema.Array(BuiltinSkillSummary) }),
    HttpApiEndpoint.put("updatePolicy", "/scanning/policy", { payload: SkillScanPolicy, success: SkillScanning, error: Forbidden }),
    HttpApiEndpoint.post("create", "/", { payload: CreateSkill, success: SkillCreated.pipe(HttpApiSchema.status(201)), error: fetchErrors }),
    HttpApiEndpoint.post("upload", "/upload", {
      query: UploadSkillQuery,
      payload: SkillArchive,
      success: SkillCreated.pipe(HttpApiSchema.status(201)),
      error: fetchErrors
    }),
    HttpApiEndpoint.get("versions", "/:id/versions", { params, success: Schema.Array(SkillVersion), error: [Forbidden, NotFound] }),
    /** Re-fetches a GitHub or link skill into a new version (not yet active unless it is the first). */
    HttpApiEndpoint.post("refetch", "/:id/versions", { params, success: SkillVersion.pipe(HttpApiSchema.status(201)), error: fetchErrors }),
    HttpApiEndpoint.post("uploadVersion", "/:id/versions/upload", {
      params,
      query: UploadVersionQuery,
      payload: SkillArchive,
      success: SkillVersion.pipe(HttpApiSchema.status(201)),
      error: fetchErrors
    }),
    HttpApiEndpoint.get("version", "/:id/versions/:version", { params: versionParams, success: SkillVersionDetail, error: [Forbidden, NotFound] }),
    HttpApiEndpoint.post("activate", "/:id/versions/:version/activate", {
      params: versionParams,
      success: SkillVersion,
      error: [Forbidden, NotFound, Conflict]
    }),
    HttpApiEndpoint.post("rescan", "/:id/versions/:version/scan", {
      params: versionParams,
      success: SkillVersion,
      error: [Forbidden, NotFound, Conflict]
    }),
    /** Lets a blocked, errored or pending version be served; needs a reason and is audited. */
    HttpApiEndpoint.post("override", "/:id/versions/:version/override", {
      params: versionParams,
      payload: OverrideScan,
      success: SkillVersion,
      error: [Forbidden, NotFound, Conflict]
    }),
    HttpApiEndpoint.get("checkUpdates", "/:id/updates", { params, success: SkillUpdateCheck, error: [Forbidden, NotFound, InvalidInput, UpstreamFailure] }),
    HttpApiEndpoint.get("bundle", "/:id/bundle", { params, success: SkillBundle, error: [Forbidden, NotFound] })
  )
  .middleware(Authentication)
  .prefix("/skills")
{}
