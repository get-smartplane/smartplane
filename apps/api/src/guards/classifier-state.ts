import { accountModeOf, type ConnectionContext, type Resource, type ToolAccess } from "@pc/domain"
import { shrinkJson } from "./grounding/compact"
import { productName } from "./grounding/products"

/** What the gateway knows about the tool being called, from the upstream listing or the integration catalog. */
export interface ToolInfo {
  readonly gatewayName?: string | undefined
  readonly title?: string | undefined
  readonly description?: string | undefined
  /** From its annotations; never shown to the classifier, used by deterministic checks (`createsInPin`). */
  readonly access?: ToolAccess | undefined
}

export interface StateInput {
  readonly actor: Readonly<Record<string, unknown>>
  readonly resource: Resource
  readonly tool: string
  readonly toolInfo?: ToolInfo | undefined
  readonly arguments: unknown
  /** The account the call goes through, as much of it as the guards need (see `applies/identity.ts`). */
  readonly connection: ConnectionContext | Readonly<Record<string, unknown>> | null
  /** Named things of the rules this call touches (see `pinning/context.ts`): labels and kinds, never ids. */
  readonly pinned?: { readonly touches: ReadonlyArray<PinnedContext>; readonly target?: string | undefined } | undefined
}

export interface PinnedContext {
  readonly label: string
  readonly kind: string
  readonly via: "self" | "child"
}

const secretKey = /pass(?:word|phrase)?$|secret|token|api[-_]?key|authori[sz]ation|credential|private[-_]?key|cookie|session[-_]?id/i
const secretValue = /^(?:Bearer\s|Basic\s|(?:sk|rk|pk)_(?:live|test)_|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|xox[abprs]-|AKIA[0-9A-Z]{16}|ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.)|-----BEGIN [A-Z ]*PRIVATE KEY-----/

/**
 * Arguments with anything credential-shaped replaced: values under credential-like keys, and strings that
 * look like bearer tokens, API keys, JWTs or private keys. Smartplane injects credentials itself, so an
 * argument holding one is never needed to judge a call, and it must not reach the classifier or a prompt.
 */
export const redactCredentials = (value: unknown): unknown => {
  if (typeof value === "string") return secretValue.test(value) ? "[redacted]" : value
  if (Array.isArray(value)) return value.map(redactCredentials)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === "string" && secretKey.test(key) ? "[redacted]" : redactCredentials(item)]))
}

const strings = (value: unknown, out: Array<string> = []): Array<string> => {
  if (typeof value === "string") out.push(value)
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out))
  else if (value !== null && typeof value === "object") Object.values(value).forEach((item) => strings(item, out))
  return out
}

const words = (slug: string) => slug.replace(/[-_]+/g, " ").trim()

/**
 * Names that are already in the arguments but hidden in URLs: a Notion page URL ends in its title
 * ("Todo-list-1f2e...") and a Linear issue URL carries the issue key and title. Read locally, never fetched,
 * so "update the to-do list" can be recognised from a call that otherwise holds only ids.
 */
export const argumentHints = (args: unknown): ReadonlyArray<string> => {
  const hints = new Set<string>()
  for (const text of strings(args)) {
    for (const match of text.matchAll(/notion\.(?:so|site)\/(?:[\w-]+\/)?([A-Za-z0-9-]+?)-([0-9a-f]{32})\b/g)) {
      if (match[1] !== undefined) hints.add(`Notion page titled "${words(match[1])}"`)
    }
    for (const match of text.matchAll(/linear\.app\/[\w-]+\/issue\/([A-Z]+-\d+)(?:\/([\w-]+))?/g)) {
      hints.add(`Linear issue ${match[1]}${match[2] === undefined ? "" : ` "${words(match[2])}"`}`)
    }
    if (hints.size >= 5) break
  }
  return [...hints].slice(0, 5)
}

const cut = (text: string | undefined, max: number) => (text === undefined || text.length <= max ? text : `${text.slice(0, max - 1)}…`)

/**
 * What Clef sees for one call: who, which resource and product, which account, the tool with its title and
 * description, and the arguments (redacted, shrunk to the budget). Without the description a call such as
 * `notion-update-page {page_id, properties}` cannot be recognised as "updating the to-do list".
 */
export const classifierState = (input: StateInput) => {
  const hints = argumentHints(input.arguments)
  return {
    actor: input.actor,
    resource: {
      kind: input.resource.config.kind,
      name: input.resource.name,
      product: productName(input.resource),
      description: cut(input.resource.description, 300),
      accountMode: accountModeOf(input.resource.config)
    },
    // Whose account the call acts as: a shared account (e.g. billing@) or the caller's own.
    connection: input.connection,
    tool: input.tool,
    ...(input.toolInfo?.gatewayName === undefined ? {} : { gatewayTool: input.toolInfo.gatewayName }),
    ...(input.toolInfo?.title === undefined ? {} : { toolTitle: cut(input.toolInfo.title, 120) }),
    ...(input.toolInfo?.description === undefined ? {} : { toolDescription: cut(input.toolInfo.description, 500) }),
    arguments: shrinkJson(redactCredentials(input.arguments)),
    ...(hints.length === 0 ? {} : { argumentHints: hints }),
    // Not called `pinned`: on Clef a field of that name read as "settled" and lowered every answer (pinning eval).
    ...(input.pinned === undefined || input.pinned.touches.length === 0 ? {} : { touchesNamed: input.pinned.touches.map(({ label, kind, via }) => ({ label: cut(label, 120), kind, via })) }),
    ...(input.pinned?.target === undefined ? {} : { target: cut(input.pinned.target, 300) })
  }
}
