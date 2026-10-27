import {
  type Actor,
  type GithubSkillConfig,
  InvalidInput,
  type LinkSkillConfig,
  type OrgId,
  type SkillSourceSnapshot,
  type UpstreamFailure
} from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { Secrets } from "../../secrets/secrets"
import type { SkillRoot } from "../bundle/root"
import { SkillFetcher } from "../fetch/fetcher"
import { downloadTarball, resolveCommit } from "./github"
import { fetchLink } from "./link"
import { extractRepositorySkill } from "./repository-archive"

export type RemoteSkillConfig = GithubSkillConfig | LinkSkillConfig

export interface FetchedSource {
  readonly root: SkillRoot
  readonly snapshot: SkillSourceSnapshot
}

type Failure = InvalidInput | UpstreamFailure

/** Fetches GitHub and link skills. A GitHub token is revealed server-side only, and the read is audited. */
export class SkillSources extends Context.Service<SkillSources, {
  readonly fetch: (orgId: OrgId, config: RemoteSkillConfig, actor: Actor) => Effect.Effect<FetchedSource, Failure>
  /** The commit a GitHub skill's ref points at now. */
  readonly latestCommit: (orgId: OrgId, config: GithubSkillConfig, actor: Actor) => Effect.Effect<string, Failure>
}>()("api/skills/SkillSources") {
  static readonly layer = Layer.effect(
    SkillSources,
    Effect.gen(function*() {
      const secrets = yield* Secrets
      const fetcher = yield* SkillFetcher
      const withFetcher = Effect.provideService(SkillFetcher, fetcher)

      const token = (orgId: OrgId, config: GithubSkillConfig, actor: Actor) =>
        config.tokenSecretId === undefined
          ? Effect.succeed(Option.none())
          : secrets.reveal(orgId, config.tokenSecretId, "skill_source", actor).pipe(
            Effect.map(Option.some),
            Effect.mapError(() => new InvalidInput({ message: "the GitHub token secret is missing", field: "tokenSecretId" }))
          )

      const latestCommit = Effect.fn("SkillSources.latestCommit")(function*(orgId: OrgId, config: GithubSkillConfig, actor: Actor) {
        return yield* withFetcher(resolveCommit(config.repo, config.ref, yield* token(orgId, config, actor)))
      })

      const github = Effect.fn("SkillSources.github")(function*(orgId: OrgId, config: GithubSkillConfig, actor: Actor) {
        const auth = yield* token(orgId, config, actor)
        const commit = yield* withFetcher(resolveCommit(config.repo, config.ref, auth))
        const tarball = yield* withFetcher(downloadTarball(config.repo, commit, auth))
        const root = yield* extractRepositorySkill(tarball, config.path)
        const snapshot: SkillSourceSnapshot = {
          type: "github",
          repo: config.repo,
          commit,
          ...(config.ref === undefined ? {} : { ref: config.ref }),
          ...(root.folder === "" ? {} : { path: root.folder })
        }
        return { root, snapshot }
      })

      const link = Effect.fn("SkillSources.link")(function*(config: LinkSkillConfig) {
        const root = yield* withFetcher(fetchLink(config.url))
        const snapshot: SkillSourceSnapshot = { type: "link", url: config.url, ...(root.folder === "" ? {} : { path: root.folder }) }
        return { root, snapshot }
      })

      return SkillSources.of({
        fetch: (orgId, config, actor) => (config.source === "github" ? github(orgId, config, actor) : link(config)),
        latestCommit
      })
    })
  )
}
