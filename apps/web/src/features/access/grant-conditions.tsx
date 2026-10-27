import type { GrantConditions } from "@pc/domain"
import { formatValues, limitsOf } from "./argument-limits/argument-limits"

/** A grant's narrowing in plain words: which tools, and which argument values each may take. */
export function GrantConditionsSummary({ conditions }: { readonly conditions: GrantConditions }) {
  const limits = limitsOf(conditions.arguments)
  if (conditions.tools === undefined && limits.length === 0) return <span className="text-muted-foreground">All</span>
  return (
    <span className="flex min-w-0 flex-col gap-1 text-xs whitespace-normal">
      {conditions.tools ? <code className="line-clamp-2">{conditions.tools.join(", ")}</code> : <span className="text-muted-foreground">All tools</span>}
      {limits.map(({ tool, path, values }) => (
        <span key={`${tool}:${path}`} className="text-muted-foreground" title={`Only allow ${tool} when ${path} is one of ${formatValues(values)}`}>
          <code className="text-foreground">{tool}</code> only when <code className="text-foreground">{path}</code> is {formatValues(values)}
        </span>
      ))}
    </span>
  )
}

/** How many limits a grant carries, for dense cells (the matrix). */
export const conditionCount = (conditions: GrantConditions): number => (conditions.tools ? 1 : 0) + limitsOf(conditions.arguments).length
