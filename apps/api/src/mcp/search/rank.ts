import type { ToolAccess } from "@pc/domain"
import { expand, stems } from "../../guards/grounding/rank"
import { slugify } from "../../platform/ids"
import type { GatewayTool } from "../provider"
import { type Field, type IndexedTool, indexTool } from "./index-tool"

const stemSet = (words: string) => new Set(stems(words))

/** Words that do not tell tools apart. Unlike guard rules, "list" is a verb here, so it is not one of them. */
const stop = stemSet("the a an to in on of for and or my me is be from with it its this that by at all some any into using via tool tools please want need how do")
const deleteVerbs = stemSet("delete remove trash destroy drop purge erase archive revoke")
const writeVerbs = new Set([...deleteVerbs, ...stemSet("create add new insert update edit change modify set rename move send post reply write upload assign merge push close cancel invite share comment publish deploy run trigger start stop make")])
const readVerbs = stemSet("list find get search read fetch show view query look retrieve download export count describe lookup check browse")

type Intent = "delete" | "write" | "read" | "neutral"

const intentOf = (words: ReadonlyArray<string>): Intent => {
  const writes = words.some((word) => writeVerbs.has(word))
  const reads = words.some((word) => readVerbs.has(word))
  if (words.some((word) => deleteVerbs.has(word))) return "delete"
  if (writes && !reads) return "write"
  if (reads && !writes) return "read"
  return "neutral"
}

/** How much a tool's read/write hint fits the query's verb: "create ..." favours writes, "list ..." reads. */
const boost: Readonly<Record<Intent, Readonly<Record<ToolAccess, number>>>> = {
  delete: { destructive: 1.5, write: 1.1, unknown: 1, read: 0.5 },
  write: { write: 1.4, destructive: 1.2, unknown: 1.1, read: 0.6 },
  read: { read: 1.4, unknown: 0.9, write: 0.7, destructive: 0.6 },
  neutral: { read: 1, write: 1, destructive: 1, unknown: 1 }
}

interface QueryWord {
  readonly word: string
  readonly related: ReadonlySet<string>
}

/** Exact stem: twice the field weight. A synonym ("add" for "create") or a prefix ("repo", "repository"): once. */
const fieldScore = ({ word, related }: QueryWord, { words, weight }: Field): number => {
  if (words.has(word)) return weight * 2
  for (const candidate of words) {
    if (related.has(candidate)) return weight
    if (word.length >= 3 && candidate.length >= 3 && (candidate.startsWith(word) || word.startsWith(candidate))) return weight
  }
  return 0
}

/** Sum over fields and query words, scaled by how many query words matched at all, then by the verb boost. */
const scoreOf = (query: ReadonlyArray<QueryWord>, intent: Intent, indexed: IndexedTool): number => {
  let total = 0
  let matched = 0
  for (const word of query) {
    const sum = indexed.fields.reduce((acc, field) => acc + fieldScore(word, field), 0)
    total += sum
    if (sum > 0) matched++
  }
  return total === 0 ? 0 : total * (0.5 + matched / query.length) * boost[intent][indexed.access]
}

/** Shorter names first on equal score (the plainer tool), then by name: the same query always ranks the same. */
const byName = (a: IndexedTool, b: IndexedTool) => a.name.length - b.name.length || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

export interface SearchOptions {
  readonly server?: string | undefined
  readonly limit: number
}

export interface SearchHits {
  readonly tools: ReadonlyArray<GatewayTool>
  /** Every tool that matched, before the limit. */
  readonly total: number
}

export const matchesServer = (indexed: IndexedTool, server: string): boolean => {
  const wanted = server.trim().toLowerCase()
  return indexed.serverNames.has(wanted) || indexed.server === slugify(wanted)
}

/**
 * Deterministic ranking over a principal's own catalog, so only tools they could call are ever found. No
 * model call: token matches with stemming and the guard ranker's synonym groups. A query of only stop words
 * (or none) browses: every tool, by name, narrowed by `server`.
 */
export const searchTools = (tools: Iterable<GatewayTool>, query: string, { server, limit }: SearchOptions): SearchHits => {
  const indexed = Array.from(tools, indexTool).filter((tool) => server === undefined || matchesServer(tool, server))
  const words = [...new Set(stems(query))].filter((word) => !stop.has(word))
  if (words.length === 0) {
    const browsed = indexed.sort(byName)
    return { tools: browsed.slice(0, limit).map((entry) => entry.tool), total: browsed.length }
  }
  const parsed = words.map((word): QueryWord => ({ word, related: expand([word]) }))
  const intent = intentOf(words)
  const hits = indexed
    .map((entry) => ({ entry, score: scoreOf(parsed, intent, entry) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || byName(a.entry, b.entry))
  return { tools: hits.slice(0, limit).map((hit) => hit.entry.tool), total: hits.length }
}
