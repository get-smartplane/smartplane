import { type DenyReason, type InvalidInput, NotFound, type Principal, renderSkill, type SkillArgumentValues } from "@pc/domain"
import { Context, Effect, Layer } from "effect"
import { AccessPolicy } from "../../access/access-policy"
import { AuditLog } from "../../audit/audit-log"
import { isBuiltinSlug } from "../../skills/builtin/builtin-skills"
import { isBuiltin, SkillContent, type ServedSkill } from "../../skills/serving/content"
import type { McpPrompt, McpPromptText, McpResource, McpResourceContents } from "../sdk-skills"
import { parseSkillUri, readableSkills, uniqueBySlug } from "./granted"
import { toContents, toPrompt, toResources } from "./mcp-shapes"

/** Built-in skills are not resources, so their reads target nothing, like built-in tools, and say so in data. */
const auditTarget = (skill: ServedSkill) => (isBuiltin(skill) ? null : { type: "resource" as const, id: skill.resource.id })
const builtinData = (skill: ServedSkill) => (isBuiltin(skill) ? { builtin: skill.slug } : {})

/**
 * Serves granted skills as MCP prompts and `skill://` resources (every file of a bundle), with the same
 * authorization as the `skills_get` built-in: a live, in-scope `read` grant on the skill, and for bundles
 * an active version that is servable under the scan policy. Every read is audited like a tool call.
 *
 * Guards do not run here: they classify actions an agent takes against a resource, while a skill read only
 * returns instructions the org approved to a caller already granted `read`, exactly as `skills_get` (a
 * built-in, also unguarded) already does. Lists are not audited, like resolving a menu; reads are.
 */
export class SkillGateway extends Context.Service<SkillGateway, {
  readonly listPrompts: (principal: Principal) => Effect.Effect<ReadonlyArray<McpPrompt>>
  readonly getPrompt: (principal: Principal, name: string, args: SkillArgumentValues) => Effect.Effect<McpPromptText, InvalidInput | NotFound>
  readonly listResources: (principal: Principal) => Effect.Effect<ReadonlyArray<McpResource>>
  readonly readResource: (principal: Principal, uri: string) => Effect.Effect<McpResourceContents, NotFound>
}>()("api/mcp/SkillGateway") {
  static readonly layer = Layer.effect(
    SkillGateway,
    Effect.gen(function*() {
      const policy = yield* AccessPolicy
      const audit = yield* AuditLog
      const content = yield* SkillContent

      const served = Effect.fn("SkillGateway.served")(function*(principal: Principal) {
        // Built-ins need no grant and own their slug: an org skill with the same slug stays reachable through `skills_get`.
        const granted = uniqueBySlug(readableSkills(yield* policy.resolve(principal))).filter((skill) => !isBuiltinSlug(skill.slug))
        const skills = yield* content.serveWithBuiltins(principal.orgId, granted)
        yield* Effect.annotateCurrentSpan({ "mcp.skills": skills.length })
        return skills
      })

      /** An unknown name is recorded as a denial, like an unknown tool: the caller may be probing. */
      const deny = (principal: Principal, asked: string) =>
        Effect.gen(function*() {
          const reasons: ReadonlyArray<DenyReason> = [{ _tag: "UnknownSkill", name: asked }]
          yield* audit.by(principal, "policy.denied", null, { skill: asked, reasons })
          return yield* new NotFound({ entity: "resource", id: asked })
        })

      const find = Effect.fn("SkillGateway.find")(function*(principal: Principal, slug: string | undefined, asked: string) {
        const skill = slug === undefined ? undefined : (yield* served(principal)).find((candidate) => candidate.slug === slug)
        return skill ?? (yield* deny(principal, asked))
      })

      const getPrompt = Effect.fn("SkillGateway.getPrompt")(function*(principal: Principal, name: string, args: SkillArgumentValues) {
        yield* Effect.annotateCurrentSpan({ "mcp.prompt": name, "org.id": principal.orgId })
        const skill = yield* find(principal, name, name)
        const target = auditTarget(skill)
        const rendered = renderSkill(yield* content.template(skill), args)
        if (rendered._tag === "Failure") {
          yield* audit.by(principal, "mcp.prompt_read", target, { prompt: name, arguments: args, rejected: rendered.failure.message, isError: true })
          return yield* rendered.failure
        }
        yield* audit.by(principal, "mcp.prompt_read", target, { prompt: name, arguments: args, version: skill.contentHash, isError: false, ...builtinData(skill) })
        return { description: skill.description, text: rendered.success }
      })

      const readResource = Effect.fn("SkillGateway.readResource")(function*(principal: Principal, uri: string) {
        yield* Effect.annotateCurrentSpan({ "mcp.resource": uri, "org.id": principal.orgId })
        const parsed = parseSkillUri(uri)
        const skill = yield* find(principal, parsed?.slug, uri)
        const file = skill.files.find((candidate) => candidate.path === parsed?.path)
        if (file === undefined) return yield* deny(principal, uri)
        yield* audit.by(principal, "mcp.resource_read", auditTarget(skill), { uri, path: file.path, version: skill.contentHash, ...builtinData(skill) })
        // Raw files: resources take no arguments, so placeholders are left for the reader.
        return toContents(uri, skill, file, yield* content.read(skill, file))
      })

      const promptOf = (skill: ServedSkill) => Effect.map(content.template(skill), (template) => toPrompt(skill, template.arguments ?? []))

      return SkillGateway.of({
        listPrompts: Effect.fn("SkillGateway.listPrompts")(function*(principal: Principal) {
          return yield* Effect.forEach(yield* served(principal), promptOf, { concurrency: 8 })
        }),
        getPrompt,
        listResources: Effect.fn("SkillGateway.listResources")(function*(principal: Principal) {
          return (yield* served(principal)).flatMap(toResources)
        }),
        readResource
      })
    })
  )
}
