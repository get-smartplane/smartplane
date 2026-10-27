import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { builtinSummaries } from "../../skills/builtin/summaries"
import { SkillDownloads } from "../../skills/download"
import { Skills } from "../../skills/skills"
import { SkillVersions } from "../../skills/versions"
import { readUpload } from "./skill-upload"

export const SkillsHandlers = HttpApiBuilder.group(PrimitiveApi, "skills", Effect.fn(function*(handlers) {
  const skills = yield* Skills
  const versions = yield* SkillVersions
  const downloads = yield* SkillDownloads
  return handlers
    .handle("builtin", () => builtinSummaries)
    .handle("scanning", () => CurrentPrincipal.use((principal) => versions.scanning(principal)))
    .handle("updatePolicy", ({ payload }) => CurrentPrincipal.use((principal) => versions.updatePolicy(principal, payload)))
    .handle("create", ({ payload }) => CurrentPrincipal.use((principal) => skills.create(principal, payload)))
    // Raw: the body is an archive (or a multipart form holding one), read with a size cap.
    .handleRaw("upload", ({ query, request }) =>
      CurrentPrincipal.use((principal) => Effect.flatMap(readUpload(request), (archive) => skills.upload(principal, query, archive))))
    .handle("versions", ({ params }) => CurrentPrincipal.use((principal) => versions.list(principal, params.id)))
    .handle("refetch", ({ params }) => CurrentPrincipal.use((principal) => skills.refetch(principal, params.id)))
    .handleRaw("uploadVersion", ({ params, query, request }) =>
      CurrentPrincipal.use((principal) => Effect.flatMap(readUpload(request), (archive) => skills.uploadVersion(principal, params.id, query.filename, archive))))
    .handle("version", ({ params }) => CurrentPrincipal.use((principal) => versions.get(principal, params.id, params.version)))
    .handle("activate", ({ params }) => CurrentPrincipal.use((principal) => versions.activate(principal, params.id, params.version)))
    .handle("rescan", ({ params }) => CurrentPrincipal.use((principal) => versions.rescan(principal, params.id, params.version)))
    .handle("override", ({ params, payload }) => CurrentPrincipal.use((principal) => versions.override(principal, params.id, params.version, payload)))
    .handle("checkUpdates", ({ params }) => CurrentPrincipal.use((principal) => skills.checkUpdates(principal, params.id)))
    .handle("bundle", ({ params }) =>
      CurrentPrincipal.use((principal) =>
        Effect.map(downloads.download(principal, params.id), (bundle) =>
          HttpServerResponse.uint8Array(bundle.archive, {
            contentType: "application/gzip",
            headers: {
              "content-disposition": `attachment; filename="${bundle.slug}.tar.gz"`,
              "x-smartplane-skill-version": bundle.contentHash
            }
          }))))
}))
