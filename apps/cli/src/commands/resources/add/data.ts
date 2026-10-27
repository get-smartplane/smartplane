import { DatabaseEngine, VariableConfig } from "@pc/domain"
import { Schema } from "effect"
import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"
import { api } from "../../../api/client"
import { readSecret } from "../../../app/secret-input"
import { field } from "../../../app/common-flags"
import { usageFailure } from "../../../app/failure"
import { resolveResource } from "../../../resolve/entities"

const SkillBody = Schema.String.check(Schema.isMaxLength(100_000))
import { commonFlags, createResource, optionalSecret, secretRef } from "./common"

export const addSecret = Command.make("secret", commonFlags, (input) =>
  Effect.gen(function*() {
    const client = yield* api
    const value = yield* readSecret(`Value for ${input.name}`)
    yield* createResource(client, input, { kind: "secret", value })
  })).pipe(
    Command.withDescription("Add a secret; the value is read from stdin or a hidden prompt, never from flags"),
    Command.withExamples([{ command: "printf %s \"$STRIPE_KEY\" | smartplane resources add secret --name stripe-key", description: "Store a key from an env var" }])
  )

export const addVariable = Command.make("variable", {
  ...commonFlags,
  value: Flag.String("value").pipe(Flag.withSchema(VariableConfig.fields.value), Flag.withDescription("Plain, non-secret value"))
}, (input) => Effect.flatMap(api, (client) => createResource(client, input, { kind: "variable", value: input.value }))).pipe(
  Command.withDescription("Add a plain configuration variable (use `secret` for credentials)")
)

export const addDatabase = Command.make("database", {
  ...commonFlags,
  engine: Flag.Literals("engine", DatabaseEngine.literals),
  connectionSecret: secretRef("connection-secret", "Connection string"),
  readWrite: Flag.Boolean("read-write").pipe(Flag.withDescription("Allow writes (default: read-only transactions)"), Flag.withDefault(false))
}, (input) =>
  Effect.gen(function*() {
    const client = yield* api
    const connectionSecretId = yield* resolveResource(client)(input.connectionSecret)
    yield* createResource(client, input, { kind: "database", engine: input.engine, connectionSecretId, readOnly: !input.readWrite })
  })).pipe(Command.withDescription("Add a Postgres or MySQL database"))

/** One of: an inline markdown file, a folder in a GitHub repository, or an HTTPS link to a SKILL.md or archive. */
export const addSkill = Command.make("skill", {
  ...commonFlags,
  file: Flag.FileText("file").pipe(Flag.withSchema(SkillBody), Flag.withDescription("Markdown file with the skill's instructions"), Flag.optional),
  repo: Flag.String("repo").pipe(Flag.withDescription("GitHub owner/repo holding the skill folder"), Flag.optional),
  path: Flag.String("path").pipe(Flag.withDescription("With --repo: folder inside the repository"), Flag.optional),
  ref: Flag.String("ref").pipe(Flag.withDescription("With --repo: branch, tag or commit"), Flag.optional),
  tokenSecret: secretRef("token-secret", "With --repo: GitHub token for a private repository").pipe(Flag.optional),
  url: Flag.String("url").pipe(Flag.withDescription("HTTPS link to a SKILL.md, .zip or .tar.gz"), Flag.optional)
}, (input) =>
  Effect.gen(function*() {
    const client = yield* api
    const sources = [input.file, input.repo, input.url].filter(Option.isSome).length
    if (sources !== 1) return yield* usageFailure("Pass exactly one of --file, --repo or --url.")
    const description = input.description
    if (Option.isSome(input.file)) return yield* createResource(client, input, { kind: "skill", description, body: input.file.value })
    if (Option.isSome(input.url)) return yield* createResource(client, input, { kind: "skill", source: "link", description, url: input.url.value })
    if (Option.isNone(input.repo)) return yield* usageFailure("Pass exactly one of --file, --repo or --url.")
    const tokenSecretId = yield* optionalSecret(client, input.tokenSecret)
    yield* createResource(client, input, {
      kind: "skill",
      source: "github",
      description,
      repo: input.repo.value,
      ...field("path", input.path),
      ...field("ref", input.ref),
      ...field("tokenSecretId", tokenSecretId)
    })
  })).pipe(
    Command.withDescription("Add a skill: inline markdown, a GitHub folder, or a link"),
    Command.withExamples([
      { command: "smartplane resources add skill --name release-notes --description \"Use when drafting release notes\" --file notes.md", description: "Inline" },
      { command: "smartplane resources add skill --name pdf --repo anthropics/skills --path skills/pdf", description: "A folder from GitHub" }
    ])
  )
