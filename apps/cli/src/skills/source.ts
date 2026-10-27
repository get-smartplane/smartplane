import { Effect, Option, Result, Schema } from "effect"
import { Base64 } from "effect/encoding"
import { CliFailure, failure } from "../app/failure"
import type { McpResources } from "./mcp"
import { SafePath, SafeSlug } from "./paths"

export const SkillArgument = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  required: Schema.optional(Schema.Boolean)
})
export type SkillArgument = typeof SkillArgument.Type

export const FileMode = Schema.Literals(["644", "755"])
export type FileMode = typeof FileMode.Type

/** The `_meta` the gateway puts on every skill file. Absent on servers that only serve `skill://<slug>`. */
const SkillMeta = Schema.Struct({
  "smartplane.dev/skill": Schema.optionalKey(Schema.String),
  "smartplane.dev/path": Schema.optionalKey(Schema.String),
  "smartplane.dev/mode": Schema.optionalKey(FileMode),
  "smartplane.dev/version": Schema.optionalKey(Schema.String)
})

const ListedResource = Schema.Struct({ uri: Schema.String, description: Schema.optional(Schema.String), _meta: Schema.optional(SkillMeta) })
const ResourceList = Schema.Struct({ resources: Schema.Array(ListedResource) })
const PromptList = Schema.Struct({ prompts: Schema.Array(Schema.Struct({ name: Schema.String, arguments: Schema.optional(Schema.Array(SkillArgument)) })) })
const ReadResult = Schema.Struct({
  contents: Schema.Array(Schema.Struct({ uri: Schema.String, text: Schema.optional(Schema.String), blob: Schema.optional(Schema.String) }))
})

export interface SkillEntry {
  readonly uri: string
  readonly path: string
  readonly mode: FileMode
}

/** A skill as listed: enough to decide whether to read it. `version` is the server's content hash, when it sends one. */
export interface SkillListing {
  readonly slug: string
  readonly description: string
  readonly arguments: ReadonlyArray<SkillArgument>
  readonly version: Option.Option<string>
  readonly entries: ReadonlyArray<SkillEntry>
}

export interface SkillFile {
  readonly path: string
  readonly mode: FileMode
  readonly bytes: Uint8Array
}

const prefix = "skill://"
const isSlug = Schema.is(SafeSlug)
const isPath = Schema.is(SafePath)

const call = <A>(schema: Schema.Codec<A, unknown>, run: () => Promise<unknown>) =>
  Effect.tryPromise({ try: run, catch: (cause) => (cause instanceof CliFailure ? cause : failure(String(cause))) }).pipe(
    Effect.flatMap((raw) => Schema.decodeUnknownEffect(schema)(raw)),
    Effect.mapError((error) => (error instanceof CliFailure ? error : failure(`Unexpected MCP response: ${error.message}`)))
  )

/** `skill://<slug>` is the SKILL.md; `skill://<slug>/<path>` any other file. `_meta` wins when present. */
const locate = (resource: typeof ListedResource.Type) => {
  const rest = resource.uri.slice(prefix.length)
  const slash = rest.indexOf("/")
  const slug = resource._meta?.["smartplane.dev/skill"] ?? (slash < 0 ? rest : rest.slice(0, slash))
  const path = resource._meta?.["smartplane.dev/path"] ?? (slash < 0 ? "SKILL.md" : rest.slice(slash + 1))
  return { slug, path, mode: resource._meta?.["smartplane.dev/mode"] ?? "644", version: resource._meta?.["smartplane.dev/version"] }
}

/**
 * Groups the gateway's `skill://` resources into skills. A skill with an unsafe slug or any unsafe path is dropped
 * whole (and reported), never partly written.
 */
export const listSkills = (mcp: McpResources) =>
  Effect.gen(function*() {
    const { resources } = yield* call(ResourceList, mcp.listResources)
    const { prompts } = yield* call(PromptList, mcp.listPrompts)
    const argumentsOf = new Map(prompts.map((prompt) => [prompt.name, prompt.arguments ?? []]))
    const bySlug = new Map<string, Array<ReturnType<typeof locate> & { uri: string; description: string | undefined }>>()
    for (const resource of resources.filter((r) => r.uri.startsWith(prefix))) {
      const located = { ...locate(resource), uri: resource.uri, description: resource.description }
      bySlug.set(located.slug, [...(bySlug.get(located.slug) ?? []), located])
    }
    const skills: Array<SkillListing> = []
    const rejected: Array<string> = []
    for (const [slug, files] of bySlug) {
      const main = files.find((file) => file.path === "SKILL.md")
      if (!isSlug(slug) || main === undefined || !files.every((file) => isPath(file.path))) {
        rejected.push(slug)
        continue
      }
      skills.push({
        slug,
        description: main.description ?? "",
        arguments: argumentsOf.get(slug) ?? [],
        version: Option.fromNullishOr(main.version),
        entries: files.map(({ mode, path, uri }) => ({ uri, path, mode }))
      })
    }
    return { skills, rejected }
  })

const bytesOf = (content: typeof ReadResult.Type["contents"][number]) =>
  content.blob !== undefined
    ? Result.mapError(Base64.decode(content.blob), () => failure(`${content.uri} is not valid base64.`))
    : Result.succeed(new TextEncoder().encode(content.text ?? ""))

/** Reads every file of one skill; each read is audited by the gateway. */
export const readSkill = (mcp: McpResources, listing: SkillListing) =>
  Effect.forEach(listing.entries, (entry) =>
    Effect.gen(function*() {
      const { contents } = yield* call(ReadResult, () => mcp.readResource(entry.uri))
      const content = contents[0]
      if (content === undefined) return yield* failure(`${entry.uri} came back empty.`)
      const bytes = yield* Effect.fromResult(bytesOf(content))
      return { path: entry.path, mode: entry.mode, bytes } satisfies SkillFile
    }))
