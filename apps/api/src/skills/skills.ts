import {
  type Conflict,
  type CreateSkill,
  type Forbidden,
  InvalidInput,
  isInlineSkill,
  type NotFound,
  type Principal,
  type ResourceId,
  type SkillConfig,
  type SkillCreated,
  type SkillSourceInput,
  type SkillSourceSnapshot,
  type SkillUpdateCheck,
  type SkillVersion,
  type UploadSkillQuery,
  type UpstreamFailure
} from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { actorOf } from "../audit/actor"
import { requirePermission } from "../auth/permissions"
import { Resources } from "../resources/resources"
import { ResourcesRepo } from "../resources/resources-repo"
import { extractArchive } from "./archive/extract"
import { DefaultArchiveLimits } from "./archive/limits"
import { makeBundle, type SkillBundle } from "./bundle/bundle"
import { selectSkillRoot, type SkillRoot } from "./bundle/root"
import { SkillIngest } from "./ingest"
import { loadSkill } from "./load"
import { type RemoteSkillConfig, SkillSources } from "./sources/skill-sources"
import { SkillVersionsRepo } from "./storage/versions-repo"

type Failure = Forbidden | NotFound | Conflict | InvalidInput | UpstreamFailure

/** What a new skill resource is called and where it lives; an empty description is taken from SKILL.md. */
export type SkillDetails = Pick<CreateSkill, "name" | "description" | "projectId">

const describe = (bundle: SkillBundle): string => bundle.skillMd.description?.slice(0, 2000) ?? ""

const configOf = (input: SkillSourceInput): RemoteSkillConfig => {
  if (input.type === "link") return { kind: "skill", source: "link", description: "", url: input.url }
  const { type: _type, ...github } = input
  return { kind: "skill", source: "github", description: "", ...github }
}

const unpack = (archive: Uint8Array) => Effect.flatMap(extractArchive(archive, DefaultArchiveLimits), (files) => selectSkillRoot(files, undefined))

const notRemote = (config: SkillConfig) =>
  new InvalidInput({ message: `a ${isInlineSkill(config) ? "inline" : config.source} skill has no source to fetch from`, field: "source" })

/**
 * Creating skills from a source and adding versions to them. A source is fetched and its bundle validated
 * before anything is stored, so a bad fetch or folder leaves no half-made resource behind; if storing the
 * first version still fails, the new resource is deleted again.
 */
export class Skills extends Context.Service<Skills, {
  readonly create: (principal: Principal, input: CreateSkill) => Effect.Effect<SkillCreated, Failure>
  /** Also behind `POST /api/resources` for GitHub and link skills, so a resource never exists without its first version. */
  readonly createFrom: (principal: Principal, input: SkillDetails, config: RemoteSkillConfig) => Effect.Effect<SkillCreated, Failure>
  readonly upload: (principal: Principal, query: UploadSkillQuery, archive: Uint8Array) => Effect.Effect<SkillCreated, Failure>
  readonly refetch: (principal: Principal, id: ResourceId) => Effect.Effect<SkillVersion, Failure>
  readonly uploadVersion: (principal: Principal, id: ResourceId, filename: string | undefined, archive: Uint8Array) => Effect.Effect<SkillVersion, Failure>
  readonly checkUpdates: (principal: Principal, id: ResourceId) => Effect.Effect<SkillUpdateCheck, Forbidden | NotFound | InvalidInput | UpstreamFailure>
}>()("api/skills/Skills") {
  static readonly layer = Layer.effect(
    Skills,
    Effect.gen(function*() {
      const resources = yield* Resources
      const repo = yield* ResourcesRepo
      const sources = yield* SkillSources
      const ingest = yield* SkillIngest
      const versions = yield* SkillVersionsRepo
      const load = (principal: Principal, id: ResourceId) => Effect.provideService(loadSkill(principal.orgId, id), ResourcesRepo, repo)

      const createWith = Effect.fn("Skills.createWith")(function*(
        principal: Principal,
        input: SkillDetails,
        config: SkillConfig,
        root: SkillRoot,
        source: SkillSourceSnapshot
      ) {
        const bundle = yield* makeBundle(root)
        const description = input.description || describe(bundle)
        const resource = yield* resources.create(principal, {
          name: input.name,
          description,
          projectId: input.projectId,
          config: { ...config, description }
        })
        const version = yield* ingest.record(principal, resource, bundle, source).pipe(
          Effect.onError(() => Effect.ignore(resources.remove(principal, resource.id)))
        )
        return { resource, version }
      })

      const createFrom = Effect.fn("Skills.createFrom")(function*(principal: Principal, input: SkillDetails, config: RemoteSkillConfig) {
        yield* requirePermission(principal, "resources:manage")
        const fetched = yield* sources.fetch(principal.orgId, config, actorOf(principal))
        return yield* createWith(principal, input, config, fetched.root, fetched.snapshot)
      })

      const create = (principal: Principal, input: CreateSkill) => createFrom(principal, input, configOf(input.source))

      const upload = Effect.fn("Skills.upload")(function*(principal: Principal, query: UploadSkillQuery, archive: Uint8Array) {
        yield* requirePermission(principal, "resources:manage")
        const root = yield* unpack(archive)
        const snapshot: SkillSourceSnapshot = { type: "upload", ...(query.filename === undefined ? {} : { filename: query.filename }) }
        return yield* createWith(principal, { ...query, projectId: query.projectId ?? null }, { kind: "skill", source: "upload", description: "" }, root, snapshot)
      })

      const refetch = Effect.fn("Skills.refetch")(function*(principal: Principal, id: ResourceId) {
        yield* requirePermission(principal, "resources:manage")
        const { resource, config } = yield* load(principal, id)
        if (isInlineSkill(config) || config.source === "upload") return yield* notRemote(config)
        const fetched = yield* sources.fetch(principal.orgId, config, actorOf(principal))
        return yield* ingest.record(principal, resource, yield* makeBundle(fetched.root), fetched.snapshot)
      })

      const uploadVersion = Effect.fn("Skills.uploadVersion")(function*(principal: Principal, id: ResourceId, filename: string | undefined, archive: Uint8Array) {
        yield* requirePermission(principal, "resources:manage")
        const { resource, config } = yield* load(principal, id)
        if (isInlineSkill(config) || config.source !== "upload") {
          return yield* new InvalidInput({ message: "only uploaded skills take new versions by upload; refetch the others", field: "source" })
        }
        const snapshot: SkillSourceSnapshot = { type: "upload", ...(filename === undefined ? {} : { filename }) }
        return yield* ingest.record(principal, resource, yield* makeBundle(yield* unpack(archive)), snapshot)
      })

      /** `resources:manage`, like fetching a version: it uses the org's GitHub token (an audited secret read). */
      const checkUpdates = Effect.fn("Skills.checkUpdates")(function*(principal: Principal, id: ResourceId) {
        yield* requirePermission(principal, "resources:manage")
        const { config } = yield* load(principal, id)
        if (isInlineSkill(config) || config.source !== "github") return yield* new InvalidInput({ message: "only GitHub skills can check for updates", field: "source" })
        const latest = yield* sources.latestCommit(principal.orgId, config, actorOf(principal))
        const active = (yield* versions.active(principal.orgId, [id]))[0]
        const current = Option.fromUndefinedOr(active?.source.type === "github" ? active.source.commit : undefined)
        const check: SkillUpdateCheck = {
          ref: config.ref ?? "HEAD",
          currentCommit: Option.getOrNull(current),
          latestCommit: latest,
          updateAvailable: Option.match(current, { onNone: () => true, onSome: (commit) => commit !== latest })
        }
        return check
      })

      return Skills.of({ create, createFrom, upload, refetch, uploadVersion, checkUpdates })
    })
  )
}
