import { InvalidInput, UpstreamFailure } from "@pc/domain"
import { Effect, Option, Redacted, Schema } from "effect"
import { RepositoryArchiveLimits } from "../archive/limits"
import { SkillFetcher } from "../fetch/fetcher"

const CommitSha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/))
const decodeSha = Schema.decodeUnknownOption(CommitSha)

const ApiHost = "api.github.com"
const CodeloadHost = "codeload.github.com"

const authHeaders = (token: Option.Option<Redacted.Redacted<string>>): Readonly<Record<string, string>> =>
  Option.match(token, { onNone: () => ({}), onSome: (value) => ({ authorization: `Bearer ${Redacted.value(value)}` }) })

/**
 * One answer for a missing repository, a missing ref, a private repository and a token that cannot read it,
 * so the endpoint cannot be used to probe which refs exist in repositories the org's token can see.
 */
const notFound = (repo: string) =>
  new InvalidInput({ message: `GitHub could not find ${repo} at the requested ref, or it is private and no token with access is set.`, field: "source" })

// 403 stays apart: GitHub uses it for rate limits, which say nothing about the repository.
const hidden = (status: number) => status === 401 || status === 404 || status === 422

/**
 * The commit `ref` resolves to right now (`HEAD`, the default branch, when no ref is given), via the
 * commits API with the `sha` media type, which answers with the bare SHA.
 */
export const resolveCommit = (repo: string, ref: string | undefined, token: Option.Option<Redacted.Redacted<string>>) =>
  Effect.gen(function*() {
    const fetcher = yield* SkillFetcher
    const wanted = ref ?? "HEAD"
    const response = yield* fetcher.get(`https://${ApiHost}/repos/${repo}/commits/${encodeURIComponent(wanted)}`, {
      headers: { accept: "application/vnd.github.sha", "x-github-api-version": "2022-11-28", ...authHeaders(token) },
      maxBytes: 1024
    })
    if (hidden(response.status)) return yield* notFound(repo)
    if (response.status !== 200) return yield* new UpstreamFailure({ upstream: "github", message: `GitHub answered ${response.status}` })
    const sha = decodeSha(new TextDecoder().decode(response.bytes).trim())
    if (Option.isNone(sha)) return yield* new UpstreamFailure({ upstream: "github", message: "GitHub did not return a commit SHA" })
    return sha.value
  }).pipe(Effect.withSpan("github.resolveCommit", { attributes: { "github.repo": repo } }))

/**
 * The repository at `commit` as a .tar.gz. Public repositories come straight from codeload; with a token
 * the API's tarball endpoint redirects to a signed codeload URL, and the token is not sent along.
 */
export const downloadTarball = (repo: string, commit: string, token: Option.Option<Redacted.Redacted<string>>) =>
  Effect.gen(function*() {
    const fetcher = yield* SkillFetcher
    const url = Option.isSome(token) ? `https://${ApiHost}/repos/${repo}/tarball/${commit}` : `https://${CodeloadHost}/${repo}/tar.gz/${commit}`
    const response = yield* fetcher.get(url, {
      headers: { "x-github-api-version": "2022-11-28", ...authHeaders(token) },
      maxBytes: RepositoryArchiveLimits.maxCompressedBytes,
      redirectHosts: [CodeloadHost]
    })
    if (hidden(response.status)) return yield* notFound(repo)
    if (response.status !== 200) return yield* new UpstreamFailure({ upstream: "github", message: `GitHub answered ${response.status}` })
    return response.bytes
  }).pipe(Effect.withSpan("github.downloadTarball", { attributes: { "github.repo": repo } }))
