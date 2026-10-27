import type { GuardTargetMatch, GuardUnknownTarget, Resource, ResourceId } from "@pc/domain"
import { productName, productOf, products } from "./products"

/** A resource the rule applies to, before its tools are looked up. */
export interface TargetMatch {
  readonly resource: Resource
  readonly product: string
  readonly matched: GuardTargetMatch
  readonly mention: string
}

export interface TargetMatches {
  readonly targets: ReadonlyArray<TargetMatch>
  readonly unknown: ReadonlyArray<GuardUnknownTarget>
}

/** Kinds a rule can be about; secrets, variables and skills are not reached through tool calls. */
const callable = new Set(["mcp_server", "integration", "tool", "database", "api"])

/** Lower case, punctuation to spaces, so "GitHub's" and "github," both read "github s" / "github". */
const normalise = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9@#.]+/g, " ").replace(/\.(?=\s|$)/g, " ").replace(/\s+/g, " ").trim()} `

const mentions = (text: string, phrase: string): boolean => {
  const needle = normalise(phrase).trim()
  return needle.length >= 2 && text.includes(` ${needle} `)
}

/** Names a resource answers to: its own name (with any "(billing@acme.com)" suffix dropped) and its slug. */
const ownNames = (resource: Resource): ReadonlyArray<string> => {
  const bare = resource.name.replace(/\s*\(.*\)\s*$/, "")
  return [...new Set([resource.name, bare, bare.replace(/[-_]+/g, " ")])].filter((name) => name.trim().length >= 3)
}

/**
 * Which of the org's resources a rule names, deterministically: an explicit scope wins; otherwise a
 * resource's own name, then its product's name or aliases ("gh", "jira", "drive"). Products the rule names
 * that the org has not added come back as `unknown`, so the author learns the rule cannot apply there.
 */
export const matchTargets = (rule: string, resources: ReadonlyArray<Resource>, scope: ReadonlyArray<ResourceId> = []): TargetMatches => {
  const text = normalise(rule)
  const candidates = resources.filter((resource) => callable.has(resource.config.kind))
  const targets: Array<TargetMatch> = []
  const add = (resource: Resource, matched: GuardTargetMatch, mention: string) => {
    if (!targets.some((target) => target.resource.id === resource.id)) targets.push({ resource, product: productName(resource), matched, mention })
  }

  if (scope.length > 0) {
    for (const resource of candidates.filter((candidate) => scope.includes(candidate.id))) add(resource, "scope", "")
  } else {
    for (const resource of candidates) {
      const name = ownNames(resource).find((candidate) => mentions(text, candidate))
      if (name !== undefined) add(resource, "name", name)
    }
    for (const resource of candidates) {
      const alias = productOf(resource)?.aliases.find((candidate) => mentions(text, candidate))
      if (alias !== undefined) add(resource, "alias", alias)
    }
  }

  const owned = new Set(candidates.flatMap((resource) => productOf(resource)?.key ?? []))
  const unknown = products.flatMap((product) => {
    if (owned.has(product.key)) return []
    const alias = product.aliases.find((candidate) => mentions(text, candidate))
    return alias === undefined ? [] : [{ mention: alias, product: product.name }]
  })
  return { targets, unknown }
}
