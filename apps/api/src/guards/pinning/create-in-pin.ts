import type { GuardOperation, ToolAccess } from "@pc/domain"
import { idsOfValue, pinKey } from "./ids"
import type { ScannedPin } from "./scan"

/** The tool's own name says it makes something new: `notion-create-pages`, `add_row`, `append-block-children`. */
const createVerb = /(?:^|[-_.\s])(?:create|add|append|insert|new)(?:$|[-_.\s])/i
/** `createPage` reads as `create_Page`. */
const words = (tool: string) => tool.replace(/([a-z0-9])([A-Z])/g, "$1_$2")

/** Argument keys that say where the new thing goes. Under `parent` (an object) every id counts. */
const containerKey = /^(?:parent|parent_?id|parent_?page_?id|container_?id|folder_?id|list_?id|database_?id|data_?source_?id|data_?source_?url|collection_?id)$/i
/** Container keys that can only name a collection (a table, a data source), never a single item. */
const collectionKey = /^(?:database_?id|data_?source_?id|data_?source_?url|collection_?id)$/i

interface ContainerId {
  readonly id: string
  /** Named by a collection key: the id of a table or data source, not of an item. */
  readonly collection: boolean
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const idsAt = (key: string, value: unknown): ReadonlyArray<ContainerId> => {
  if (isRecord(value)) return Object.entries(value).flatMap(([inner, item]) => idsOfValue(item).map((id) => ({ id, collection: collectionKey.test(inner) })))
  return idsOfValue(value).map((id) => ({ id, collection: collectionKey.test(key) }))
}

/** Ids in the places a create call names its destination: top-level container keys, and each item's `parent`. */
export const containerIds = (args: unknown): ReadonlyArray<ContainerId> => {
  if (!isRecord(args)) return []
  return Object.entries(args).flatMap(([key, value]): ReadonlyArray<ContainerId> => {
    if (containerKey.test(key)) return idsAt(key, value)
    // Batch creates: `pages: [{ parent: {...} }]`.
    if (Array.isArray(value)) return value.flatMap((item) => (isRecord(item) && item["parent"] !== undefined ? idsAt("parent", item["parent"]) : []))
    return []
  })
}

export interface CreateCall {
  /** The upstream tool name. */
  readonly tool: string
  /** From the tool's own annotations or catalog entry; `unknown` never counts as a change. */
  readonly access: ToolAccess | undefined
  readonly arguments: unknown
  /** What the guard's rule governs on its target (`CompiledGuard.operations`). */
  readonly operations: ReadonlyArray<GuardOperation> | undefined
}

/**
 * The pin a call creates something inside, when that is certain without asking the classifier: the rule
 * covers creating items in what it names, the tool is a known non-read-only create, append or add, and its
 * destination is the pinned thing itself (its own id), or a table or data source known to be inside it
 * (named by a collection key, so never a single row).
 *
 * Why a deterministic answer is acceptable here but not in general: the pin says what the call touches (an
 * admin confirmed that id is the thing the rule names) and the tool's own name and annotations say what it
 * does, so the only judgement left, "does the rule forbid adding items here", was read from the rule when it
 * compiled. Everywhere else the classifier judges meaning; a probability floor there would turn a guess into
 * a block. Anything uncertain (an unknown access, a row as parent, no `create` in the rule) returns nothing.
 */
export const createsInPin = (call: CreateCall, pins: ReadonlyArray<ScannedPin>): ScannedPin | undefined => {
  if (call.operations?.includes("create") !== true) return undefined
  if (call.access !== "write" && call.access !== "destructive") return undefined
  if (!createVerb.test(words(call.tool))) return undefined
  const ids = containerIds(call.arguments)
  if (ids.length === 0) return undefined
  return pins.find((pin) => ids.some(({ id, collection }) => id === pinKey(pin.entityId) || (collection && pin.children.has(id))))
}

/** The violation probability a call that certainly creates inside a pin is recorded with. */
export const CreateInPinProbability = 1
