import { AccessToken, CreatedAccessToken, MaxTokenTtlDays, Name } from "@pc/domain"
import { Effect, Option, Redacted, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { api } from "../../api/client"
import { projectFlag } from "../../app/common-flags"
import { usageFailure } from "../../app/failure"
import { parseDays } from "../../app/flag-values"
import { formatTime } from "../../app/format"
import { emit, note, out, toJson } from "../../app/output"
import { JsonOutput } from "../../app/settings"
import { tableOr } from "../../app/table"
import { resolveProject, resolveToken } from "../../resolve/entities"
import { Removed } from "../resources/remove"

const all = Flag.Boolean("all").pipe(Flag.withDescription("Every token in the org (needs tokens:manage)"), Flag.withDefault(false))

const tokenTable = (tokens: ReadonlyArray<AccessToken>) =>
  tableOr(
    "No tokens.",
    ["id", "name", "kind", "prefix", "scope", "expires", "last used"],
    tokens.map((t) => [t.id, t.name, t.kind.replace("_", "-"), `${t.prefix}…`, t.projectId ?? "org", formatTime(t.expiresAt), formatTime(t.lastUsedAt)])
  )

const listTokens = Command.make("ls", { all }, ({ all }) =>
  Effect.gen(function*() {
    const tokens = yield* (yield* api).tokens.list({ query: { scope: all ? "all" : "mine" } })
    yield* emit(Schema.Array(AccessToken), tokens, tokenTable)
  })).pipe(Command.withDescription("List active access tokens"), Command.withAlias("list"))

const createToken = Command.make("create", {
  name: Flag.String("name").pipe(Flag.withSchema(Name), Flag.withDescription("What the token is for, e.g. ci-deploy")),
  kind: Flag.ChoiceWithValue("kind", [["personal", "personal"], ["service-account", "service_account"]] as const).pipe(
    Flag.withDescription("personal acts as you; service-account is its own grant subject"),
    Flag.withDefault("personal")
  ),
  ttl: Flag.String("ttl").pipe(Flag.withDescription(`Lifetime, e.g. 30d (max ${MaxTokenTtlDays}d)`), Flag.withDefault(`${MaxTokenTtlDays}d`)),
  project: projectFlag
}, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const ttlDays = Option.filter(parseDays(flags.ttl), (days) => days >= 1 && days <= MaxTokenTtlDays)
    if (Option.isNone(ttlDays)) return yield* usageFailure(`--ttl must be 1 to ${MaxTokenTtlDays} days.`)
    const projectId = yield* Effect.transposeOption(Option.map(flags.project, resolveProject(client)))
    const created = yield* client.tokens.create({
      payload: { name: flags.name, kind: flags.kind, projectId: Option.getOrNull(projectId), ttlDays: ttlDays.value }
    })
    // The plaintext is shown exactly once. Alone on stdout, so `TOKEN=$(smartplane tokens create ...)` works.
    if (yield* JsonOutput) return yield* out(JSON.stringify(yield* toJson(CreatedAccessToken, created), null, 2))
    yield* note(`Created ${created.token.name} (${created.token.id}), expires ${formatTime(created.token.expiresAt)}. It will not be shown again.`)
    yield* out(Redacted.value(created.plaintext))
  })).pipe(
    Command.withDescription("Create an access token; prints it once"),
    Command.withExamples([{ command: "smartplane tokens create --name ci --kind service-account --ttl 30d", description: "A token for CI" }])
  )

const revokeToken = Command.make("revoke", {
  token: Argument.String("token").pipe(Argument.withDescription("Token id, name or prefix")),
  all
}, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const id = yield* resolveToken(client, flags.all ? "all" : "mine")(flags.token)
    yield* client.tokens.revoke({ params: { id } })
    yield* emit(Removed, { id, removed: true }, () => `Revoked ${id}.`)
  })).pipe(Command.withDescription("Revoke an access token immediately"))

export const tokens = Command.make("tokens").pipe(
  Command.withDescription("Personal and service-account access tokens (pc_…)"),
  Command.withSubcommands([listTokens, createToken, revokeToken])
)
