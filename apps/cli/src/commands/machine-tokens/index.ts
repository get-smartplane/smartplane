import { envNameOf, MachineToken, MaxTokenTtlDays, Name, type Resource, ResourceId } from "@pc/domain"
import { DateTime, Effect, Option, Redacted, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { type Api, api } from "../../api/client"
import { lookupNames } from "../../api/names"
import { projectFlag } from "../../app/common-flags"
import { usageFailure } from "../../app/failure"
import { CommaList, parseDays } from "../../app/flag-values"
import { formatTime } from "../../app/format"
import { emit, emitWith, note, out, toJson } from "../../app/output"
import { JsonOutput } from "../../app/settings"
import { tableOr } from "../../app/table"
import { resolveProject } from "../../resolve/entities"
import { type Naming, pick } from "../../resolve/pick"
import { Removed } from "../resources/remove"
import { cliAgentPrompt, CreatedWithPrompt, platformFlag } from "./agent-prompt"

const machineTokenNaming: Naming<MachineToken> = {
  entity: "machine token",
  id: (token) => token.id,
  names: (token) => [token.name, token.prefix],
  label: (token) => `${token.name} (${token.prefix}…)`
}

/** What a machine token may receive: secrets and variables, by resource name or by the env name they are delivered as. */
const deliverableNaming: Naming<Resource> = {
  entity: "secret or variable",
  id: (resource) => resource.id,
  names: (resource) => [resource.name, envNameOf(resource) ?? null],
  label: (resource) => `${resource.name} (${resource.config.kind})`
}

const resolveMachineToken = (client: Api, query: string) =>
  Effect.map(Effect.flatMap(client.machineTokens.list(), (tokens) => pick(machineTokenNaming, query, tokens)), (token) => token.id)

/** All `--allow` names from one resource listing, with the same exact-then-case-insensitive matching as elsewhere. */
const resolveAllowed = (client: Api, names: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const isId = Schema.is(ResourceId)
    const resources = names.every(isId) ? [] : yield* client.resources.list({ query: {} })
    const values = resources.filter((resource) => resource.config.kind === "secret" || resource.config.kind === "variable")
    return yield* Effect.forEach(names, (name) => (isId(name) ? Effect.succeed(name) : Effect.map(pick(deliverableNaming, name, values), (r) => r.id)))
  })

/** Token lifetimes are whole days from now, up to 90: `30d`, `2w`, `30`, or a date. */
const ttlDays = (text: string) =>
  Effect.gen(function*() {
    const now = yield* DateTime.now
    const date = /^\d{4}-\d{2}-\d{2}/.test(text) ? DateTime.make(text) : Option.none()
    const days = Option.isSome(date)
      ? Option.some(Math.ceil((DateTime.toEpochMillis(date.value) - DateTime.toEpochMillis(now)) / 86_400_000))
      : parseDays(text)
    const valid = Option.filter(days, (d) => d >= 1 && d <= MaxTokenTtlDays)
    if (Option.isNone(valid)) return yield* usageFailure(`--expires must be 1 to ${MaxTokenTtlDays} days ahead (30d, 2w or a date), not "${text}".`)
    return valid.value
  })

const expires = Flag.String("expires").pipe(
  Flag.withDescription(`Lifetime from now: 30d, 2w or a date, up to ${MaxTokenTtlDays}d (default ${MaxTokenTtlDays}d)`),
  Flag.optional
)

const ttlField = (flag: Option.Option<string>) =>
  Effect.map(Effect.transposeOption(Option.map(flag, ttlDays)), (days) => (Option.isSome(days) ? { ttlDays: days.value } : {}))

const list = Command.make("ls", {}, () =>
  Effect.gen(function*() {
    const client = yield* api
    const tokens = yield* client.machineTokens.list()
    yield* emitWith(Schema.Array(MachineToken), tokens, (rows) =>
      Effect.gen(function*() {
        const names = yield* lookupNames(client, rows.flatMap((token) => token.allow.map((id) => ({ kind: "resource" as const, id }))))
        return tableOr(
          "No machine tokens.",
          ["id", "name", "prefix", "project", "allow", "expires", "last used"],
          rows.map((t) => [
            t.id,
            t.name,
            `${t.prefix}…`,
            t.projectId ?? "org",
            t.allow.map((id) => names.of("resource", id)).join(","),
            formatTime(t.expiresAt),
            formatTime(t.lastUsedAt)
          ])
        )
      }))
  })).pipe(Command.withDescription("List machine tokens"), Command.withAlias("list"))

const create = Command.make("create", {
  name: Flag.String("name").pipe(Flag.withSchema(Name), Flag.withDescription("The service it is for, e.g. api-prod")),
  project: projectFlag,
  allow: Flag.String("allow").pipe(
    Flag.withSchema(CommaList(Schema.NonEmptyString)),
    Flag.withDescription("Secrets and variables it may receive: names, env names or ids, comma-separated")
  ),
  expires,
  platform: platformFlag
}, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const ttl = yield* ttlField(flags.expires)
    const projectId = yield* Effect.transposeOption(Option.map(flags.project, resolveProject(client)))
    const [first, ...rest] = yield* resolveAllowed(client, flags.allow)
    if (first === undefined) return yield* usageFailure("--allow needs at least one name.")
    const created = yield* client.machineTokens.create({
      payload: { name: flags.name, allow: [first, ...rest], ...(Option.isSome(projectId) ? { projectId: projectId.value } : {}), ...ttl }
    })
    const agentPrompt = cliAgentPrompt(created, flags.platform)
    // Shown exactly once, alone on stdout, so `TOKEN=$(smartplane machine-tokens create ...)` works.
    if (yield* JsonOutput) return yield* out(JSON.stringify(yield* toJson(CreatedWithPrompt, { ...created, agentPrompt }), null, 2))
    yield* note(`Created machine token ${created.token.name} (${created.token.id}), expires ${formatTime(created.token.expiresAt)}. It will not be shown again.`)
    yield* note(`Store it as SMARTPLANE_TOKEN in the service's environment, or let your coding agent do it:`)
    yield* note(`  1. In the shell you start the agent from: export SMARTPLANE_TOKEN=<the token printed below>`)
    yield* note(`  2. Give the agent this prompt:\n\n${agentPrompt}\n`)
    yield* out(Redacted.value(created.plaintext))
  })).pipe(
    Command.withDescription("Create a delivery-only token for a deployed service; prints it once"),
    Command.withExamples([{
      command: "smartplane machine-tokens create --name api-prod --project api --allow DATABASE_URL,STRIPE_KEY --expires 30d",
      description: "A token for a Railway service's SMARTPLANE_TOKEN"
    }, {
      command: "export SMARTPLANE_TOKEN=$(smartplane machine-tokens create --name web --allow STRIPE_KEY --platform vercel)",
      description: "Create one and keep it in this shell for your coding agent; the prompt goes to stderr"
    }])
  )

const renew = Command.make("renew", {
  token: Argument.String("token").pipe(Argument.withDescription("Machine token id, name or prefix")),
  expires
}, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const ttl = yield* ttlField(flags.expires)
    const id = yield* resolveMachineToken(client, flags.token)
    const renewed = yield* client.machineTokens.renew({ params: { id }, payload: ttl })
    yield* emit(MachineToken, renewed, (t) => `Renewed ${t.name} (${t.id}) until ${formatTime(t.expiresAt)}.`)
  })).pipe(Command.withDescription("Extend a machine token's expiry from now"))

const revoke = Command.make("revoke", {
  token: Argument.String("token").pipe(Argument.withDescription("Machine token id, name or prefix"))
}, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const id = yield* resolveMachineToken(client, flags.token)
    yield* client.machineTokens.revoke({ params: { id } })
    yield* emit(Removed, { id, removed: true }, () => `Revoked ${id}.`)
  })).pipe(Command.withDescription("Revoke a machine token immediately"))

export const machineTokens = Command.make("machine-tokens").pipe(
  Command.withDescription("Delivery-only tokens (pcm_…) for services that fetch secrets at boot"),
  Command.withSubcommands([list, create, renew, revoke])
)
